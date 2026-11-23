"""Foundation C: report-only static security scan (plan Rev 3 §11, §16.8).

Covers: seeded fixtures per rule (positive and negative); bandit on generated
Python, its timeout, a missing binary and unusable output (all recorded as
skipped, build unaffected); 0 provider calls during a stub build with the flag
on; report-only (status, credits and events identical with the flag on and
off); secret masking in excerpts; flag off means no scan.

Secret-shaped fixture values are assembled at runtime so this file never
contains one literally (the repository's secret scanners read it too).
"""
from __future__ import annotations

import ast
import asyncio
import json
import os
import sys
import time

import pytest

from sandbox import static_security as ss
from sandbox.static_security import scan_rules, scan_static_security


BANDIT_AVAILABLE = ss._resolve_bandit_command() is not None
needs_bandit = pytest.mark.skipif(not BANDIT_AVAILABLE, reason="bandit is not installed")

# --- runtime-assembled secret-shaped values ---------------------------------
AWS_KEY_ID = "AKIA" + "IOSFODNN7" + "EXAMPLE"
AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY"
STRIPE_LIVE = "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"
STRIPE_RESTRICTED = "rk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"
GOOGLE_KEY = "AIza" + "SyA1234567890" + "abcdefghijklmnopqrstuv"
SLACK_TOKEN = "xoxb-" + "1234567890-" + "abcdefghijkl"
GITHUB_PAT = "ghp_" + "0123456789abcdef" + "ABCDEF0123456789abcd"
GITHUB_FINE_PAT = "github_pat_" + "11ABCDEFG0123456789_" + "abcdefghij"
GENERIC_SECRET = "q8ZrT2vLm9Xw" + "P4kNs7Yd"
PEM_HEADER = "-----BEGIN RSA " + "PRIVATE KEY-----"

# Recognisable without context (vendor prefix, or long and key-shaped).
SHAPED_SECRET_VALUES = [
    AWS_KEY_ID, AWS_SECRET, STRIPE_LIVE, STRIPE_RESTRICTED, GOOGLE_KEY,
    SLACK_TOKEN, GITHUB_PAT, GITHUB_FINE_PAT,
]
ALL_SECRET_VALUES = SHAPED_SECRET_VALUES + [GENERIC_SECRET]


def _rule_lines(findings, rule_id):
    return sorted(f.line for f in findings if f.rule_id == rule_id)


# ---------------------------------------------------------------------------
# Seeded fixtures per rule. (rule_id, path, code, lines expected to fire)
# An empty expected list is a negative fixture.
# ---------------------------------------------------------------------------

RULE_FIXTURES = [
    # dynamic code execution
    ("js-eval", "src/calc.js", "const v = eval(userInput);\n", [1]),
    ("js-eval", "src/calc.js", "const v = evaluate(expr);\n// never eval(input)\nconst myEval = 1;\n", []),
    ("js-new-function", "src/x.ts", "const fn = new Function('a', body);\n", [1]),
    ("js-new-function", "src/x.ts", "function add(a, b) { return a + b; }\nconst p = Function.prototype;\n", []),
    ("js-string-timer", "src/t.js", "setTimeout(\"refresh()\", 1000);\n", [1]),
    ("js-string-timer", "src/t.js", "setTimeout(() => refresh(), 1000);\nsetInterval(tick, 50);\n", []),
    # XSS sinks
    ("react-dangerously-set-inner-html", "src/Post.tsx",
     "export const Post = ({ post }) => (\n  <div dangerouslySetInnerHTML={{ __html: post.body }} />\n);\n", [2]),
    ("react-dangerously-set-inner-html", "src/Post.tsx",
     "<div dangerouslySetInnerHTML={html} />\n", [1]),
    ("react-dangerously-set-inner-html", "src/Post.tsx",
     "<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }} />\n"
     "<div dangerouslySetInnerHTML={{ __html: \"<b>static</b>\" }} />\n", []),
    ("dom-inner-html", "src/list.js", "el.innerHTML = \"<li>\" + item.name + \"</li>\";\n", [1]),
    ("dom-inner-html", "src/list.js", "list.insertAdjacentHTML('beforeend', `<li>${name}</li>`);\n", [1]),
    ("dom-inner-html", "src/list.js", "el.outerHTML += html;\n", [1]),
    ("dom-inner-html", "src/list.js",
     "el.innerHTML = \"\";\nel.innerHTML = DOMPurify.sanitize(html);\n"
     "if (el.innerHTML === \"\") {}\nel.textContent = name;\n", []),
    ("dom-document-write", "index.html", "<script>document.write(params.get('q'));</script>\n", [1]),
    ("dom-document-write", "src/w.js", "documentWriter.write(x);\n", []),
    # token storage
    ("web-storage-token", "src/auth.ts", "localStorage.setItem(\"authToken\", data.token);\n", [1]),
    ("web-storage-token", "src/auth.ts", "sessionStorage[\"jwt\"] = token;\nlocalStorage.accessToken = t;\n", [1, 2]),
    ("web-storage-token", "src/auth.ts",
     "localStorage.setItem(\"theme\", \"dark\");\nconst t = localStorage.getItem(\"token\");\n"
     "localStorage.setItem(\"author\", name);\n", []),
    # CORS
    ("cors-wildcard-credentials", "server/index.js",
     "app.use(cors({ origin: '*', credentials: true }));\n", [1]),
    ("cors-wildcard-credentials", "server/index.js",
     "res.setHeader('Access-Control-Allow-Origin', '*');\n"
     "res.setHeader('Access-Control-Allow-Credentials', 'true');\n", [1]),
    ("cors-wildcard-credentials", "backend/main.py",
     "app.add_middleware(\n    CORSMiddleware,\n    allow_origins=[\"*\"],\n    allow_credentials=True,\n)\n", [3]),
    ("cors-wildcard-credentials", "server/index.js",
     "app.use(cors({\n  origin: '*',\n  credentials: true,\n}));\n", [2]),
    ("cors-wildcard-credentials", "server/index.js",
     "app.use(cors({ origin: 'https://app.example.com', credentials: true }));\n", []),
    ("cors-wildcard-credentials", "server/index.js", "app.use(cors({ origin: '*' }));\n", []),
    ("cors-wildcard-credentials", "server/index.js",
     "publicApi.use(cors({ origin: '*' }));\n" + "\n" * 20
     + "const session = { cookie: {}, credentials: true };\n", []),
    ("cors-wildcard-credentials", "backend/main.py",
     "app.add_middleware(CORSMiddleware, allow_origins=[\"*\"], allow_methods=[\"*\"])\n", []),
    # child_process
    ("child-process-exec-interpolation", "server/convert.js",
     "const { exec } = require('child_process');\nexec(`convert ${file} out.png`, cb);\n", [2]),
    ("child-process-exec-interpolation", "server/convert.js",
     "import { execSync } from 'node:child_process';\nexecSync('ls ' + dir);\n", [2]),
    ("child-process-exec-interpolation", "server/convert.js",
     "const { exec, execFile } = require('child_process');\nexecFile('ls', [dir]);\n"
     "exec('npm run build');\nexec(\"echo a+b\");\n", []),
    ("child-process-exec-interpolation", "src/re.js", "const m = re.exec(`${s}`);\n", []),
    # plaintext endpoints
    ("insecure-http-endpoint", "src/api.ts", "const API_URL = \"http://api.weather-data.io/v1\";\n", [1]),
    ("insecure-http-endpoint", "src/api.ts", "const ws = new WebSocket('ws://stream.myapp.io/feed');\n", [1]),
    ("insecure-http-endpoint", "backend/client.py",
     "import requests\nr = requests.get(\"http://api.partner.com/data\", timeout=5)\n", [2]),
    ("insecure-http-endpoint", "src/api.ts",
     "fetch(\"http://localhost:8000/api\");\nfetch(\"https://api.weather-data.io/v1\");\n"
     "fetch(\"http://backend:8000/api\");\nfetch(\"http://192.168.1.10/api\");\n", []),
    ("insecure-http-endpoint", "index.html", "<a href=\"http://partner.com\">Partner</a>\n", []),
    # TLS
    ("tls-verification-disabled", "server/agent.js",
     "const agent = new https.Agent({ rejectUnauthorized: false });\n", [1]),
    ("tls-verification-disabled", "server/agent.js",
     "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';\n", [1]),
    ("tls-verification-disabled", ".env", "NODE_TLS_REJECT_UNAUTHORIZED=0\n", [1]),
    ("tls-verification-disabled", "server/agent.js", "const agent = new https.Agent({ rejectUnauthorized: true });\n", []),
    # secrets (moderation's patterns)
    ("secret-aws-access-key-id", "src/aws.js", f"const id = \"{AWS_KEY_ID}\";\n", [1]),
    ("secret-aws-secret-access-key", "config.py", "aws_secret_" + f"access_key = \"{AWS_SECRET}\"\n", [1]),
    ("secret-stripe-live-secret-key", "server/pay.js", f"const stripe = new Stripe(\"{STRIPE_LIVE}\");\n", [1]),
    ("secret-stripe-restricted-key", "server/pay.js", f"const rk = \"{STRIPE_RESTRICTED}\";\n", [1]),
    ("secret-google-api-key", "src/maps.ts", f"const mapsKey = \"{GOOGLE_KEY}\";\n", [1]),
    ("secret-slack-token", "bot.py", f"SLACK = \"{SLACK_TOKEN}\"\n", [1]),
    ("secret-github-personal-access-token", "deploy.sh", f"TOKEN=\"{GITHUB_PAT}\"\n", [1]),
    ("secret-github-fine-grained-pat", "src/gh.ts", f"const gh = \"{GITHUB_FINE_PAT}\";\n", [1]),
    ("secret-private-key", "certs/key.json", f"{{\"key\": \"{PEM_HEADER}\\nMIIBOg\"}}\n", [1]),
    ("secret-generic-assignment", "src/conf.js", f"const api_secret = \"{GENERIC_SECRET}\";\n", [1]),
    ("secret-generic-assignment", "src/conf.js",
     "const api_secret = \"YOUR_API_SECRET_HERE\";\nconst api_secret2 = process.env.API_SECRET;\n", []),
    ("secret-aws-access-key-id", "src/aws.js", "const id = process.env.AWS_ACCESS_KEY_ID;\n", []),
]


@pytest.mark.parametrize(
    "rule_id,path,code,expected",
    RULE_FIXTURES,
    ids=[f"{r}-{'pos' if e else 'neg'}-{i}" for i, (r, _p, _c, e) in enumerate(RULE_FIXTURES)],
)
def test_rule_fixture(rule_id, path, code, expected):
    findings = scan_rules({path: code})
    assert _rule_lines(findings, rule_id) == expected
    for f in findings:
        assert f.source == ss.SOURCE_RULE
        assert f.file == path


def test_every_rule_has_a_positive_and_a_negative_fixture():
    positive = {r for r, _p, _c, e in RULE_FIXTURES if e}
    negative = {r for r, _p, _c, e in RULE_FIXTURES if not e}
    assert positive == set(ss.RULE_IDS)
    # Each moderation vendor pattern shares the negative "no literal" case;
    # every non-secret rule has its own negative fixture.
    assert {r for r in ss.RULE_IDS if not r.startswith("secret-")} <= negative


def test_secret_rules_reuse_every_moderation_secret_pattern():
    from sandbox.moderation import _LINE_RULES
    moderation_secret_patterns = [p for cat, _s, p, _m in _LINE_RULES if cat == "secret"]
    assert len(moderation_secret_patterns) == len(ss._VENDOR_SECRET_PATTERNS)
    assert all(a is b for a, b in zip(moderation_secret_patterns, ss._VENDOR_SECRET_PATTERNS))
    assert {
        "secret-aws-access-key-id", "secret-aws-secret-access-key", "secret-stripe-live-secret-key",
        "secret-stripe-restricted-key", "secret-google-api-key", "secret-slack-token",
        "secret-github-personal-access-token", "secret-github-fine-grained-pat",
        "secret-private-key", "secret-generic-assignment",
    } <= ss.RULE_IDS


def test_finding_shape():
    [finding] = scan_rules({"src/a.js": "const v = eval(x);\n"})
    assert set(finding.to_dict()) == {
        "rule_id", "severity", "confidence", "file", "line", "excerpt", "message", "source",
    }
    assert finding.severity in ("high", "medium", "low")
    assert finding.excerpt == "const v = eval(x);"


def test_comment_lines_are_not_reported():
    code = "// el.innerHTML = html;\n/* eval(x) */\n * new Function(body)\n"
    assert scan_rules({"src/a.js": code}) == []
    assert scan_rules({"main.py": "# requests.get(\"http://api.partner.com\")\n"}) == []


def test_js_rules_do_not_run_on_python_and_vice_versa():
    assert _rule_lines(scan_rules({"main.py": "x = eval(data)\n"}), "js-eval") == []
    assert scan_rules({"README.md": "eval(x) and new Function(y)"}) == []


def test_out_of_scope_paths_are_not_scanned():
    files = {
        "node_modules/lib/index.js": "eval(x);\n",
        "dist/app.min.js": "eval(x);\n",
        "package-lock.json": f"{{\"k\": \"{AWS_KEY_ID}\"}}\n",
        "logo.png": "eval(x);",
    }
    assert scan_rules(files) == []


# ---------------------------------------------------------------------------
# Secret masking
# ---------------------------------------------------------------------------


def test_vendor_secret_excerpt_is_masked():
    [finding] = scan_rules({"src/aws.js": f"const id = \"{AWS_KEY_ID}\";\n"})
    assert AWS_KEY_ID not in finding.excerpt
    assert "AKIA****" in finding.excerpt


@pytest.mark.parametrize("value", SHAPED_SECRET_VALUES)
def test_mask_secrets_hides_secret_shaped_values_without_context(value):
    assert value not in ss.mask_secrets(f"const k = \"{value}\";")


@pytest.mark.parametrize("value", ALL_SECRET_VALUES)
def test_mask_secrets_hides_every_seeded_secret_in_context(value):
    for line in (
        f"api_secret = \"{value}\"",
        "aws_secret_" + f"access_key = \"{value}\"",
        f"const config = {{ token: '{value}' }};",
        f"headers: {{ Authorization: `Bearer {value}` }}",
    ):
        assert value not in ss.mask_secrets(line)


def test_mask_secrets_named_literals_bearer_and_url_credentials():
    assert ss.mask_secrets('client.login(user, "plain text")') == 'client.login(user, "plain text")'
    assert ss.mask_secrets('pass' + 'word = "hunter2"') == 'pass' + 'word = "****"'
    assert ss.mask_secrets('if pass' + 'word == "hunter2":') == 'if pass' + 'word == "****":'
    assert ss.mask_secrets('{"apiKey": "abc123"}') == '{"apiKey": "****"}'
    assert ss.mask_secrets("Authorization: Bearer abcdefghijkl") == "Authorization: Bearer ****"
    masked_url = ss.mask_secrets("postgres://admin:" + "s3cretpw@db.internal/app")
    assert "s3cretpw" not in masked_url and "admin:****@" in masked_url


def test_long_identifiers_are_not_masked():
    line = "const thisIsAVeryLongDescriptiveIdentifierName = computeSomething();"
    assert ss.mask_secrets(line) == line


def test_excerpt_is_masked_before_truncation():
    # The secret straddles the excerpt cut: truncating first would leave its
    # first characters unmatched and in clear.
    line = "y" * 141 + f" token: \"{GENERIC_SECRET}\" }}"
    assert line.index(GENERIC_SECRET) < ss.MAX_EXCERPT_CHARS < line.index(GENERIC_SECRET) + len(GENERIC_SECRET)
    excerpt = ss._excerpt(line)
    assert len(excerpt) <= ss.MAX_EXCERPT_CHARS + 3
    assert GENERIC_SECRET[:4] not in excerpt
    assert "token: \"****\"" in excerpt


async def test_no_secret_value_appears_anywhere_in_a_report():
    files = {
        "src/aws.js": f"const id = \"{AWS_KEY_ID}\";\nlocalStorage.setItem(\"token\", \"{GITHUB_PAT}\");\n",
        "server/pay.js": f"const stripe = new Stripe(\"{STRIPE_LIVE}\");\n",
        "bot.py": f"SLACK = \"{SLACK_TOKEN}\"\npass" + f"word = \"{GENERIC_SECRET}\"\n",
    }
    report = await scan_static_security(files)
    dumped = json.dumps(report)
    assert report["findings"]
    for value in (AWS_KEY_ID, GITHUB_PAT, STRIPE_LIVE, SLACK_TOKEN, GENERIC_SECRET):
        assert value not in dumped


@needs_bandit
async def test_bandit_excerpt_and_message_are_masked():
    files = {"app/settings.py": "pass" + f"word = \"{GENERIC_SECRET}\"\n"}
    report = await scan_static_security(files)
    bandit = [f for f in report["findings"] if f["source"] == "bandit"]
    assert any(f["rule_id"] == "B105" for f in bandit)
    for f in bandit:
        assert GENERIC_SECRET not in f["excerpt"]
        assert GENERIC_SECRET not in f["message"]


# ---------------------------------------------------------------------------
# bandit
# ---------------------------------------------------------------------------


@needs_bandit
async def test_bandit_reports_generated_python_with_original_paths():
    files = {
        "backend/app/main.py": "import subprocess\n\ndef run(cmd):\n    subprocess.call(cmd, shell=True)\n",
        "backend/app/ok.py": "def add(a, b):\n    return a + b\n",
    }
    report = await scan_static_security(files)
    assert report["status"] == "completed"
    assert report["scanners"]["bandit"]["status"] == "completed"
    assert report["scanners"]["bandit"]["files"] == 2
    b602 = [f for f in report["findings"] if f["rule_id"] == "B602"]
    assert len(b602) == 1
    assert b602[0] == {
        "rule_id": "B602",
        "severity": "high",
        "confidence": "high",
        "file": "backend/app/main.py",
        "line": 4,
        "excerpt": "subprocess.call(cmd, shell=True)",
        "message": b602[0]["message"],
        "source": "bandit",
    }
    assert not [f for f in report["findings"] if f["file"] == "backend/app/ok.py"]


@needs_bandit
async def test_bandit_ignores_nosec_in_generated_code():
    files = {"main.py": "import subprocess\nsubprocess.call(x, shell=True)  # nosec\n"}
    report = await scan_static_security(files)
    assert any(f["rule_id"] == "B602" for f in report["findings"])


@needs_bandit
async def test_bandit_skips_assert_used():
    report = await scan_static_security({"tests/test_x.py": "def test_x():\n    assert 1 == 1\n"})
    assert report["findings"] == []
    assert report["scanners"]["bandit"]["status"] == "completed"


@needs_bandit
async def test_generated_code_is_parsed_never_executed(tmp_path):
    marker = tmp_path / "executed.txt"
    payload = f"open({str(marker)!r}, 'w').write('ran')\n"
    files = {
        # Named like stdlib modules bandit itself imports: if the scan
        # directory were importable, these would run.
        "json.py": payload,
        "ast.py": payload,
        "app/main.py": "import json\n" + payload,
        "app/__init__.py": payload,
    }
    report = await scan_static_security(files)
    assert report["scanners"]["bandit"]["status"] == "completed"
    assert not marker.exists()


@needs_bandit
async def test_bandit_parse_errors_are_counted_not_fatal():
    report = await scan_static_security({"bad.py": "def broken(:\n", "good.py": "x = 1\n"})
    assert report["scanners"]["bandit"]["status"] == "completed"
    assert report["scanners"]["bandit"]["parse_errors"] == 1


async def test_bandit_timeout_is_recorded_as_skipped(monkeypatch):
    monkeypatch.setattr(ss, "_resolve_bandit_command", lambda: [sys.executable, "-c", "import time; time.sleep(30)"])
    files = {"main.py": "x = 1\n", "src/a.js": "eval(x);\n"}
    started = time.monotonic()
    report = await scan_static_security(files, bandit_timeout_s=0.5)
    assert time.monotonic() - started < 10
    assert report["scanners"]["bandit"]["status"] == "skipped"
    assert "timed out" in report["scanners"]["bandit"]["reason"]
    # The rules still ran: the report is partial, not lost.
    assert report["scanners"]["rules"]["status"] == "completed"
    assert report["status"] == "partial"
    assert [f["rule_id"] for f in report["findings"]] == ["js-eval"]


@pytest.mark.parametrize("command,reason", [
    (None, "not installed"),
    (["/nonexistent/forge-bandit-binary"], "could not be started"),
    ([sys.executable, "-c", "print('not json')"], "no JSON report"),
    ([sys.executable, "-c", "import sys; sys.exit(2)"], "no JSON report"),
])
async def test_missing_or_broken_bandit_is_recorded_as_skipped(monkeypatch, command, reason):
    monkeypatch.setattr(ss, "_resolve_bandit_command", lambda: command)
    report = await scan_static_security({"main.py": "import subprocess\nsubprocess.call(x, shell=True)\n"})
    assert report["scanners"]["bandit"]["status"] == "skipped"
    assert reason in report["scanners"]["bandit"]["reason"]
    assert report["status"] == "partial"
    assert not [f for f in report["findings"] if f["source"] == "bandit"]


def test_bandit_subprocess_gets_no_credentials(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-value-for-test")
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017/x")
    env = ss._subprocess_env()
    assert "OPENAI_API_KEY" not in env and "MONGODB_URL" not in env
    assert set(env) <= {"PATH", "LANG", "LC_ALL", "PYTHONIOENCODING", "PYTHONDONTWRITEBYTECODE", "SYSTEMROOT"}


def test_bandit_runs_in_isolated_mode():
    command = ss._resolve_bandit_command()
    if command and command[0] == sys.executable:
        assert command[1] == "-I"


async def test_python_only_build_without_bandit_has_no_bandit_findings(monkeypatch):
    monkeypatch.setattr(ss, "_resolve_bandit_command", lambda: None)
    report = await scan_static_security({"main.py": "x = 1\n"})
    assert report["scanners"]["rules"]["status"] == "completed"
    assert report["findings"] == []


async def test_no_python_means_bandit_not_applicable(monkeypatch):
    def _fail():
        raise AssertionError("bandit must not be resolved without Python files")
    monkeypatch.setattr(ss, "_resolve_bandit_command", _fail)
    report = await scan_static_security({"src/a.js": "const a = 1;\n"})
    assert report["scanners"]["bandit"]["status"] == "not_applicable"
    assert report["status"] == "completed"


async def test_rule_engine_error_is_recorded_as_skipped(monkeypatch):
    def _boom(_files):
        raise RuntimeError("boom")
    monkeypatch.setattr(ss, "scan_rules", _boom)
    report = await scan_static_security({"src/a.js": "eval(x);\n"})
    assert report["scanners"]["rules"]["status"] == "skipped"
    assert report["status"] == "skipped"
    assert "RuntimeError" in report["reason"]


async def test_unexpected_scanner_error_never_raises(monkeypatch):
    def _boom(*_a):
        raise ValueError("boom")
    monkeypatch.setattr(ss, "_scan_sync", _boom)
    report = await scan_static_security({"src/a.js": "eval(x);\n"})
    assert report["status"] == "skipped"
    assert report["reason"] == "scanner error (ValueError)"
    assert report["findings"] == [] and report["report_only"] is True


async def test_overall_scan_timeout_is_recorded_as_skipped(monkeypatch):
    monkeypatch.setattr(ss, "_OVERALL_GRACE_S", 0.2)

    def _slow(*_a):
        time.sleep(1.0)
        return {}
    monkeypatch.setattr(ss, "_scan_sync", _slow)
    report = await scan_static_security({"src/a.js": "x"}, bandit_timeout_s=0.0)
    assert report["status"] == "skipped"
    assert "timed out" in report["reason"]


# ---------------------------------------------------------------------------
# Bounds and determinism
# ---------------------------------------------------------------------------


async def test_file_count_bound(monkeypatch):
    monkeypatch.setattr(ss, "MAX_FILES", 3)
    files = {f"src/f{i}.js": "eval(x);\n" for i in range(5)}
    report = await scan_static_security(files)
    assert report["files_scanned"] == 3
    assert report["files_skipped"] == 2
    assert report["truncated"] is True
    assert sorted({f["file"] for f in report["findings"]}) == ["src/f0.js", "src/f1.js", "src/f2.js"]


async def test_oversized_python_is_not_given_to_bandit(monkeypatch):
    monkeypatch.setattr(ss, "MAX_FILE_BYTES", 100)
    seen = {}

    def _fake_bandit(py_files, _timeout):
        seen.update(py_files)
        return [], 0
    monkeypatch.setattr(ss, "_run_bandit_sync", _fake_bandit)
    report = await scan_static_security({"big.py": "x = 1\n" * 50, "small.py": "x = 1\n"})
    assert list(seen) == ["small.py"]
    assert report["scanners"]["bandit"]["files_skipped"] == 1
    assert report["truncated"] is True


async def test_finding_count_bound_keeps_full_counts(monkeypatch):
    monkeypatch.setattr(ss, "MAX_FINDINGS", 2)
    report = await scan_static_security({"src/a.js": "eval(a);\neval(b);\neval(c);\neval(d);\neval(e);\n"})
    assert len(report["findings"]) == 2
    assert report["counts"]["high"] == 5
    assert report["truncated"] is True


async def test_long_minified_line_stays_fast():
    line = "a" * 150_000 + "; el.innerHTML = x; " + "password" * 1000
    started = time.monotonic()
    report = await scan_static_security({"src/bundle.js": line})
    assert time.monotonic() - started < 5
    assert report["status"] == "completed"


async def test_report_is_deterministic():
    files = {
        "src/b.js": "eval(x);\nlocalStorage.setItem('token', t);\n",
        "src/a.js": "el.innerHTML = html;\n",
        "main.py": "import subprocess\nsubprocess.call(x, shell=True)\n",
    }
    first = await scan_static_security(files)
    second = await scan_static_security(dict(reversed(list(files.items()))))
    first.pop("duration_ms")
    second.pop("duration_ms")
    assert first == second
    keys = [(f["file"], f["line"]) for f in first["findings"]]
    assert keys == sorted(keys)


@pytest.mark.parametrize("files", [None, [], "x", {"a.js": 123, "b.js": None, "c.js": b"eval(x)"}])
async def test_non_dict_or_non_string_input_is_harmless(files):
    report = await scan_static_security(files)
    assert report["status"] == "completed"
    assert report["findings"] == []


def test_scanner_module_imports_no_provider_code():
    """Static guarantee behind "0 provider calls": the scanner imports only
    the standard library and the moderation patterns."""
    tree = ast.parse(open(ss.__file__, encoding="utf-8").read())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0] if node.module != "sandbox.moderation" else node.module)
    assert imported <= {
        "__future__", "asyncio", "importlib", "json", "logging", "os", "re", "shutil",
        "subprocess", "sys", "tempfile", "time", "dataclasses", "typing", "sandbox.moderation",
    }


# ---------------------------------------------------------------------------
# Build integration: flag, report-only, 0 provider calls
# ---------------------------------------------------------------------------

GENERATED_FILES = {
    "src/App.tsx": "export const App = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;\n",
    "src/auth.ts": "localStorage.setItem('authToken', token);\n",
    "backend/main.py": "import subprocess\n\ndef run(cmd):\n    subprocess.call(cmd, shell=True)\n",
}


class _StubAgent:
    """Every pipeline agent, without a provider."""

    async def blueprint(self, *a, **kw):
        return {"integrations": [], "features": []}

    async def improve(self, *a, **kw):
        return {"summary": "ok"}

    async def design(self, *a, **kw):
        return {"theme": "default"}

    async def generate_files(self, *a, **kw):
        return {"files": dict(GENERATED_FILES)}

    async def integrate(self, *a, **kw):
        return {"files": {}, "instructions": ""}

    async def validate(self, *a, **kw):
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        return {"files": {}}


def _make_build():
    from core.models import Build
    return Build(id="build-fc", project_id="p1", user_id="u1", prompt="Build a todo app")


async def _run_stub_build(monkeypatch, *, flag: bool, timeout_s: float = 20.0, pm=None):
    from core import orchestrator as orch_module
    from core.orchestrator import Orchestrator

    async def _no_byok(self, user_id):
        return False

    async def _no_profile(self, build, agent_type):
        return None

    monkeypatch.setattr(Orchestrator, "_is_byok_active", _no_byok)
    monkeypatch.setattr(Orchestrator, "_resolve_agent_profile", _no_profile)
    monkeypatch.setattr(orch_module, "launch_shadow_comparison", lambda *a, **kw: None)
    monkeypatch.setattr(orch_module.settings, "static_security_report", flag)
    monkeypatch.setattr(orch_module.settings, "static_security_bandit_timeout_s", timeout_s)

    orchestrator = Orchestrator()
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        setattr(orchestrator, attr, _StubAgent())
    if pm is not None:
        orchestrator.pm = pm

    events = []

    async def emit(event):
        events.append(event)

    build = _make_build()
    build, files = await orchestrator.run_build(build, emit=emit, sandbox_runner=None)
    return build, files, events


def _complete_event(events):
    [event] = [e for e in events if e.type.value == "build_complete"]
    return event


def _guard_providers(monkeypatch):
    """Make every provider entry point raise and count the attempts."""
    import httpx
    from core.llm.router import LLMRouter
    from gateway.service import AIGateway

    calls = []

    def _raiser(name):
        def _raise(*_a, **_kw):
            calls.append(name)
            raise AssertionError(f"provider entry point called: {name}")
        return _raise

    for cls, names in (
        (AIGateway, ("generate", "stream", "validate_output")),
        (LLMRouter, ("generate", "stream")),
        (httpx.AsyncClient, ("send",)),
        (httpx.Client, ("send",)),
    ):
        for name in names:
            monkeypatch.setattr(cls, name, _raiser(f"{cls.__name__}.{name}"))
    return calls


async def test_flag_off_means_no_scan(monkeypatch):
    from core.models import BuildStatus

    async def _must_not_run(*_a, **_kw):
        raise AssertionError("static security scan ran with the flag off")
    monkeypatch.setattr(ss, "scan_static_security", _must_not_run)

    build, _files, events = await _run_stub_build(monkeypatch, flag=False)
    assert build.status == BuildStatus.SUCCESS
    assert build.static_security is None
    assert "static_security" not in _complete_event(events).data["validation"]


async def test_flag_on_attaches_report_to_build_and_build_complete(monkeypatch):
    from core.models import BuildStatus

    build, _files, events = await _run_stub_build(monkeypatch, flag=True)
    assert build.status == BuildStatus.SUCCESS
    report = build.static_security
    assert report["report_only"] is True
    assert report["status"] in ("completed", "partial")
    rule_ids = {f["rule_id"] for f in report["findings"]}
    assert {"react-dangerously-set-inner-html", "web-storage-token"} <= rule_ids
    if BANDIT_AVAILABLE:
        assert "B602" in rule_ids
    assert _complete_event(events).data["validation"]["static_security"] == report
    # Persisted with the build (tasks/build_tasks.py stores build.model_dump()).
    assert build.model_dump()["static_security"] == report


async def test_zero_provider_calls_with_the_flag_on(monkeypatch):
    from core.models import BuildStatus

    calls = _guard_providers(monkeypatch)
    build, _files, _events = await _run_stub_build(monkeypatch, flag=True)
    assert calls == []
    assert build.status == BuildStatus.SUCCESS
    assert build.static_security["findings"]


async def test_report_only_status_credits_and_events_identical(monkeypatch):
    off_build, off_files, off_events = await _run_stub_build(monkeypatch, flag=False)
    on_build, on_files, on_events = await _run_stub_build(monkeypatch, flag=True)

    assert on_build.static_security["counts"]["high"] >= 1  # there was something to report
    assert on_build.status == off_build.status
    assert on_build.credits_used == off_build.credits_used
    assert on_build.debug_iterations == off_build.debug_iterations
    assert [(a.agent, a.status) for a in on_build.agents] == [(a.agent, a.status) for a in off_build.agents]
    assert on_files == off_files
    assert [e.type for e in on_events] == [e.type for e in off_events]

    on_complete = dict(_complete_event(on_events).data)
    off_complete = dict(_complete_event(off_events).data)
    on_validation = dict(on_complete.pop("validation"))
    off_validation = dict(off_complete.pop("validation"))
    on_validation.pop("static_security")
    assert on_validation == off_validation
    assert on_complete == off_complete
    assert "passed" in on_validation and on_validation["passed"] is True


@pytest.mark.parametrize("command", [
    None,
    ["/nonexistent/forge-bandit-binary"],
    [sys.executable, "-c", "import time; time.sleep(30)"],
])
async def test_scanner_failure_in_a_build_is_skipped_and_harmless(monkeypatch, command):
    from core.models import BuildStatus

    monkeypatch.setattr(ss, "_resolve_bandit_command", lambda: command)
    off_build, _f, _e = await _run_stub_build(monkeypatch, flag=False)
    build, _files, events = await _run_stub_build(monkeypatch, flag=True, timeout_s=1.0)
    assert build.status == BuildStatus.SUCCESS
    assert build.credits_used == off_build.credits_used
    report = build.static_security
    assert report["scanners"]["bandit"]["status"] == "skipped"
    assert report["scanners"]["bandit"]["reason"]
    assert _complete_event(events).data["validation"]["static_security"]["status"] == "partial"


async def test_whole_scan_failure_in_a_build_is_skipped_and_harmless(monkeypatch):
    from core.models import BuildStatus

    def _boom(*_a):
        raise RuntimeError("boom")
    monkeypatch.setattr(ss, "_scan_sync", _boom)
    build, _files, events = await _run_stub_build(monkeypatch, flag=True)
    assert build.status == BuildStatus.SUCCESS
    assert build.static_security["status"] == "skipped"
    assert build.static_security["reason"] == "scanner error (RuntimeError)"
    assert _complete_event(events).type.value == "build_complete"


async def test_flag_is_read_once_at_build_start(monkeypatch):
    from core import orchestrator as orch_module

    class _FlipFlagPM(_StubAgent):
        async def validate(self, *a, **kw):
            # Turning the flag off mid-build does not change this attempt
            # (monkeypatch restores the original value afterwards).
            orch_module.settings.static_security_report = False
            return {"passed": True}

    build, _files, _events = await _run_stub_build(monkeypatch, flag=True, pm=_FlipFlagPM())
    assert orch_module.settings.static_security_report is False
    assert build.static_security is not None


def test_snapshot_config():
    class _S:
        static_security_report = False
        static_security_bandit_timeout_s = 20.0

    assert ss.snapshot_config(_S()) is None
    _S.static_security_report = True
    assert ss.snapshot_config(_S()) == {"bandit_timeout_s": 20.0}
    _S.static_security_bandit_timeout_s = 0.0
    assert ss.snapshot_config(_S()) == {"bandit_timeout_s": 1.0}
    _S.static_security_bandit_timeout_s = 10_000
    assert ss.snapshot_config(_S()) == {"bandit_timeout_s": 120.0}
    assert ss.snapshot_config(object()) is None


def test_settings_default_off():
    from core.config import Settings
    assert Settings.model_fields["static_security_report"].default is False


async def test_attach_report_touches_only_its_own_keys():
    from core.models import Build, BuildStatus

    build = Build(project_id="p", user_id="u", prompt="x", status=BuildStatus.SUCCESS, credits_used=7)
    before = build.model_dump(exclude={"static_security"})
    validation = {"passed": True, "moderation": None}
    report = await ss.attach_report(build, validation, {"src/a.js": "eval(x);\n"}, {"bandit_timeout_s": 5.0})
    assert build.model_dump(exclude={"static_security"}) == before
    assert build.static_security == report
    assert validation == {"passed": True, "moderation": None, "static_security": report}
    assert await ss.attach_report(build, validation, {}, None) is None


def test_event_loop_is_not_blocked_by_the_scan():
    """Rules and bandit run in a worker thread, so a concurrent coroutine
    keeps running while a large scan is in progress."""
    async def main():
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                ticks += 1
                await asyncio.sleep(0.005)

        task = asyncio.create_task(ticker())
        files = {f"src/f{i}.js": ("el.innerHTML = x;\n" * 1000) for i in range(10)}
        await scan_static_security(files)
        task.cancel()
        return ticks

    assert asyncio.run(main()) > 1


def test_report_survives_json_round_trip():
    report = asyncio.run(scan_static_security({"src/a.js": "eval(x);\n", "main.py": "x = 1\n"}))
    assert json.loads(json.dumps(report)) == report


def test_tempdir_is_removed(monkeypatch, tmp_path):
    monkeypatch.setattr(ss.tempfile, "tempdir", str(tmp_path))
    asyncio.run(scan_static_security({"main.py": "x = 1\n"}))
    assert not [p for p in os.listdir(tmp_path) if p.startswith("forge-static-security-")]
