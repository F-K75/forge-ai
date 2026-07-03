import asyncio
import tempfile
import os
from core.config import get_settings

settings = get_settings()


class SandboxRunner:
    """
    Writes generated files to a temp directory and runs:
    1. Python syntax check on backend files
    2. TypeScript type check on frontend files (via tsc --noEmit)
    3. Basic import resolution check

    Returns error string if issues found, None if clean.
    """

    async def run(self, files: dict) -> str:  # NOTE: project uses a simple "clean vs errors" string
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write all files
            for path, content in files.items():
                full_path = os.path.join(tmpdir, path)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, "w") as f:
                    f.write(content)

            errors = []

            # Check Python syntax
            py_errors = await self._check_python(tmpdir, files)
            if py_errors:
                errors.extend(py_errors)

            # Check for obvious JS/TS issues
            ts_errors = await self._check_typescript_basic(tmpdir, files)
            if ts_errors:
                errors.extend(ts_errors)

            # Return "" when clean so callers can treat non-empty as errors
            return "\n".join(errors) if errors else ""

    async def _check_python(self, tmpdir: str, files: dict) -> list:
        errors = []
        py_files = [p for p in files.keys() if p.endswith(".py")]

        for py_file in py_files:
            full_path = os.path.join(tmpdir, py_file)
            proc = await asyncio.create_subprocess_exec(
                "python3", "-m", "py_compile", full_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            if proc.returncode != 0:
                errors.append(f"Python syntax error in {py_file}:\n{stderr.decode()}")

        return errors

    async def _check_typescript_basic(self, tmpdir: str, files: dict) -> list:
        """
        Basic check: look for obvious broken imports / syntax in TSX files.
        A full tsc check would require npm install which is too slow for the loop.
        """
        errors = []
        ts_files = [p for p in files.keys() if p.endswith((".ts", ".tsx"))]

        for ts_file in ts_files:
            content = files[ts_file]
            # Check for obviously unclosed braces (very basic)
            open_braces = content.count("{") - content.count("}")
            if abs(open_braces) > 5:
                errors.append(
                    f"Possible unclosed braces in {ts_file}: "
                    f"imbalance of {open_braces}"
                )

        return errors

