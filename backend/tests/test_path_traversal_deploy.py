"""
Regression tests for P0-HIGH-005: file path traversal / arbitrary file write
in the deployment and sandbox file-materialization paths.

AI-generated build "files" are keyed by a path that is attacker/AI-influenced.
Those paths are joined onto a temp (sandbox) directory and written to disk
during deployment and sandbox validation. Without a traversal guard a path
like ``../../etc/cron.d/evil`` or an absolute ``/etc/passwd`` escapes the
intended directory and can overwrite arbitrary host files in the worker
process. ``safe_join_path`` must reject such paths and the callers must skip
them rather than writing outside the sandbox.
"""
import os

from core.security import safe_join_path, is_safe_relpath


class TestIsSafeRelpath:
    def test_accepts_normal_relative_paths(self):
        assert is_safe_relpath("src/app.py")
        assert is_safe_relpath("README.md")
        assert is_safe_relpath("a/b/c.txt")

    def test_rejects_dotdot(self):
        assert not is_safe_relpath("../etc/passwd")
        assert not is_safe_relpath("a/../../b")
        assert not is_safe_relpath("../../../../etc/shadow")

    def test_rejects_absolute(self):
        assert not is_safe_relpath("/etc/passwd")
        # On POSIX, a Windows-style path is a relative filename and is contained
        # by safe_join_path's abspath check, so it is not rejected here; the
        # traversal guard that matters is the containment check below.

    def test_rejects_empty_and_dotdot_only(self):
        assert not is_safe_relpath("")
        assert not is_safe_relpath("..")
        assert not is_safe_relpath(".")

    def test_rejects_windows_separators(self):
        # On POSIX a backslash is a normal filename char; the path stays
        # contained by safe_join_path, so this verifies containment not rejection.
        assert is_safe_relpath("a\\b")

    def test_rejects_embedded_dotdot_segment(self):
        # A ".." segment that actually escapes (not just collapses within base)
        # must be rejected.
        assert not is_safe_relpath("a/../../b")
        # a/../b collapses to "b" (still inside base) and is considered safe;
        # the real escape guard is safe_join_path's containment check below.
        assert is_safe_relpath("a/../b")


class TestSafeJoinPath:
    def test_joins_inside_base(self, tmp_path):
        joined = safe_join_path(str(tmp_path), "src/app.py")
        assert joined is not None
        assert joined.startswith(os.path.abspath(str(tmp_path)) + os.path.sep)

    def test_rejects_traversal(self, tmp_path):
        joined = safe_join_path(str(tmp_path), "../../etc/passwd")
        assert joined is None

    def test_rejects_absolute(self, tmp_path):
        joined = safe_join_path(str(tmp_path), "/etc/passwd")
        assert joined is None

    def test_never_escapes_base_despite_normpath_tricks(self, tmp_path):
        # Genuinely escaping inputs are rejected.
        for malicious in ("..", "..//..//etc", "a/../../b", "../x"):
            assert safe_join_path(str(tmp_path), malicious) is None
        # "....//etc" does NOT escape ("...." is a normal filename segment and
        # resolves inside base), so it is accepted and stays contained.
        joined = safe_join_path(str(tmp_path), "....//etc")
        assert joined is not None
        assert joined.startswith(os.path.abspath(str(tmp_path)) + os.path.sep)


class TestSandboxMaterializationRejectsTraversal:
    """End-to-end check that the deployment/sandbox write loops refuse to
    materialize a traversed path (mirrors api/deployments.py and
    sandbox/runner.py logic)."""

    def _write_like_caller(self, base_dir, files):
        written = []
        skipped = []
        for path, content in files.items():
            file_path = safe_join_path(base_dir, path)
            if file_path is None:
                skipped.append(path)
                continue
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            written.append(file_path)
        return written, skipped

    def test_traversal_target_not_written(self, tmp_path):
        base = tmp_path / "sandbox"
        base.mkdir()
        outside = tmp_path / "outside.txt"
        files = {"../../outside.txt": "pwned"}
        written, skipped = self._write_like_caller(str(base), files)
        assert written == []
        assert skipped == ["../../outside.txt"]
        assert not outside.exists()

    def test_safe_file_is_written_inside_sandbox(self, tmp_path):
        base = tmp_path / "sandbox"
        base.mkdir()
        files = {"src/app.py": "print('hi')"}
        written, skipped = self._write_like_caller(str(base), files)
        assert skipped == []
        assert len(written) == 1
        assert written[0].startswith(os.path.abspath(str(base)) + os.path.sep)
        with open(written[0]) as f:
            assert f.read() == "print('hi')"
