"""Deterministic content-moderation tests for generated application code.

These lock in detection of leaked secrets and destructive operations (the
blocking findings that the build pipeline's PM debug loop must remediate) and
the non-blocking warnings (supply-chain / dynamic-execution risks), while
proving benign apps and obvious placeholders are not flagged.
"""


from sandbox.moderation import (
    scan_code,
    ModerationReport,
    SEVERITY_WARN,
    _is_placeholder,
)


def _categories(report: ModerationReport):
    return {f.category for f in report.findings}


def _severities(report: ModerationReport):
    return {f.severity for f in report.findings}


# --- Blocking: hardcoded secrets ------------------------------------------------

async def test_aws_access_key_id_is_blocked():
    files = {"app.py": 'key = "AKIAIOSFODNN7EXAMPLE"' }
    report = await scan_code(files)
    assert report.has_blocking
    assert "secret" in _categories(report)
    assert any("AKIA" in f.snippet for f in report.findings)


async def test_aws_secret_assignment_is_blocked():
    files = {"config.py": 'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"'}
    report = await scan_code(files)
    assert report.has_blocking


async def test_private_key_block_is_blocked():
    files = {"key.pem": "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----"}
    report = await scan_code(files)
    assert report.has_blocking
    assert any(f.category == "secret" for f in report.findings)


async def test_stripe_live_key_is_blocked():
    files = {"pay.py": 'stripe.api_key = "sk_live_4eC39HqLyjWDarjtT1zdp7dc"'}
    report = await scan_code(files)
    assert report.has_blocking


async def test_google_api_key_is_blocked():
    files = {"g.py": 'API_KEY = "AIzaSyA1234567890abcdefghijklmnopqrstuv"' }
    report = await scan_code(files)
    assert report.has_blocking


async def test_slack_token_is_blocked():
    files = {"slack.py": 'token = "xoxb-1234567890-1234567890123-abcdefghijklmnop"' }
    report = await scan_code(files)
    assert report.has_blocking


async def test_github_pat_is_blocked():
    files = {"gh.py": 'token = "ghp_0123456789abcdefABCDEF0123456789abcd"' }
    report = await scan_code(files)
    assert report.has_blocking


# --- Blocking: destructive operations -------------------------------------------

async def test_rm_rf_root_is_blocked():
    files = {"cleanup.sh": "rm -rf /"}
    report = await scan_code(files)
    assert report.has_blocking
    assert "destructive" in _categories(report)


async def test_rm_rf_glob_is_blocked():
    files = {"cleanup.sh": "sudo rm -rf /*"}
    report = await scan_code(files)
    assert report.has_blocking


async def test_shutil_rmtree_root_is_blocked():
    files = {"app.py": 'import shutil\nshutil.rmtree("/")'}
    report = await scan_code(files)
    assert report.has_blocking


async def test_fork_bomb_is_blocked():
    files = {"bomb.sh": ":(){ :|:& };:"}
    report = await scan_code(files)
    assert report.has_blocking


async def test_dd_disk_overwrite_is_blocked():
    files = {"wipe.sh": "dd if=/dev/zero of=/dev/sda"}
    report = await scan_code(files)
    assert report.has_blocking


async def test_os_system_shutdown_is_blocked():
    files = {"app.py": 'import os\nos.system("shutdown -h now")'}
    report = await scan_code(files)
    assert report.has_blocking


# --- Warnings (non-blocking) ----------------------------------------------------

async def test_curl_pipe_sh_is_warned():
    files = {"setup.sh": "curl https://example.com/install.sh | sh"}
    report = await scan_code(files)
    assert not report.has_blocking
    assert SEVERITY_WARN in _severities(report)
    assert "supply_chain" in _categories(report)


async def test_eval_is_warned():
    files = {"app.py": "result = eval(user_input)"}
    report = await scan_code(files)
    assert not report.has_blocking
    assert "dynamic_execution" in _categories(report)


async def test_generic_secret_assignment_warned_when_real():
    files = {"cfg.py": 'api_key = "a8f5f167f44f4964e6c998dee827110c"'}
    report = await scan_code(files)
    assert not report.has_blocking
    assert any(
        f.severity == SEVERITY_WARN and f.category == "secret" for f in report.findings
    )


# --- False-positive discipline -------------------------------------------------

async def test_placeholder_secret_assignment_not_flagged():
    files = {"cfg.py": 'api_key = "YOUR_API_KEY_HERE"'}
    report = await scan_code(files)
    assert not any(f.category == "secret" for f in report.findings)


async def test_legitimate_rm_rf_subdir_not_blocked():
    files = {"cleanup.sh": "rm -rf ./build"}
    report = await scan_code(files)
    assert not report.has_blocking


async def test_benign_app_has_no_findings():
    files = {
        "main.py": (
            "from fastapi import FastAPI\n"
            "app = FastAPI()\n"
            "\n"
            "@app.get('/')\n"
            "def home():\n"
            "    return {'hello': 'world'}\n"
        ),
        "package.json": '{"name": "app", "scripts": {"start": "node index.js"}}',
    }
    report = await scan_code(files)
    assert report.findings == []


async def test_non_string_files_skipped():
    files = {"x": 123, "y": None, "z": b"AKIAIOSFODNN7EXAMPLE"}
    report = await scan_code(files)
    assert report.findings == []


# --- Report helpers ------------------------------------------------------------

async def test_blocking_lines_rendered_for_debug_loop():
    files = {"app.py": 'key = "AKIAIOSFODNN7EXAMPLE"'}
    report = await scan_code(files)
    lines = report.blocking_lines()
    assert len(lines) == 1
    assert lines[0].startswith("[moderation:secret]")


async def test_to_dict_shape():
    files = {"app.py": 'key = "AKIAIOSFODNN7EXAMPLE"'}
    report = await scan_code(files)
    d = report.to_dict()
    assert d["blocking"] is True
    assert d["counts"]["block"] >= 1
    assert d["findings"][0]["category"] == "secret"


def test_is_placeholder_helper():
    assert _is_placeholder("YOUR_KEY_HERE")
    assert _is_placeholder("short")
    assert not _is_placeholder("a8f5f167f44f4964e6c998dee827110c")
