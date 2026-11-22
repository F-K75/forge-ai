#!/usr/bin/env bash
# Regression probes for the grep-based secret scanner's allowlist.
#
# The same scanner definitions (SECRET_PATTERNS, ALLOW_LINE and its helper
# regexes) live in two places that must stay identical:
#   - scripts/git-hooks/pre-commit
#   - .github/workflows/secret-scanning.yml ("grep fallback scanner" step)
# This script loads the definitions from BOTH, checks they agree, and runs
# each one's exact match pipeline over probe lines:
#   - the one allowed expression must NOT be flagged;
#   - literals, modified expressions and near-misses MUST be flagged.
#
# Probe values are fake and assembled at runtime from fragments, so this file
# never contains a scanner-matching string itself.
#
# Usage (from the repo root): bash scripts/git-hooks/test-secret-allowlist.sh
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
HOOK="$ROOT/scripts/git-hooks/pre-commit"
WF="$ROOT/.github/workflows/secret-scanning.yml"

# Print the definitions block (SECRET_PATTERNS=( ... through ALLOW_LINE=...),
# de-indented, from either file.
defs_from() {
  awk '/SECRET_PATTERNS=\(/{f=1} f{print} f&&/ALLOW_LINE=/{exit}' "$1" | sed -E 's/^ {10}//'
}

# Run one file's definitions + its own match pipeline over stdin lines;
# prints the lines it would flag.
scan_with() {
  local src="$1" drop_comments="$2"
  bash -c "
    set -u
    $(defs_from "$src")
    COMBINED_PATTERN=\$(IFS='|'; echo \"\${SECRET_PATTERNS[*]}\")
    grep -nE \"\$COMBINED_PATTERN\" | grep -vE '$drop_comments' | grep -vE \"\$ALLOW_LINE\" || true
  "
}

FAIL=0
ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }

# --- 1. The two copies must define exactly the same scanner ------------------
echo "== definitions identical in pre-commit and secret-scanning.yml"
value_of() {  # value_of <file> <var>
  bash -c "set -u; $(defs_from "$1"); COMBINED=\$(IFS='|'; echo \"\${SECRET_PATTERNS[*]}\"); printf '%s' \"\$$2\""
}
h=$(value_of "$HOOK" ALLOW_LINE); w=$(value_of "$WF" ALLOW_LINE)
if [ -n "$h" ] && [ "$h" = "$w" ]; then ok "ALLOW_LINE"; else bad "ALLOW_LINE differs (or is empty)"; fi
# The pattern lists drifted once (the hook gained Cashfree patterns the CI
# copy never got), so CI silently stopped scanning for them. Fail on drift.
h=$(value_of "$HOOK" COMBINED); w=$(value_of "$WF" COMBINED)
if [ -n "$h" ] && [ "$h" = "$w" ]; then ok "SECRET_PATTERNS"; else bad "SECRET_PATTERNS differ (or are empty)"; fi

# --- 2. Probes ---------------------------------------------------------------
S="sec""ret"; W="whs""ec_"; P="pass""word"; FAKE="ZZprobe""NOTreal""99xyz"
CF="c""f_"; CFL="cash""free_"; FAKE20="${FAKE}0"   # Cashfree patterns need 20+ chars
ALLOWED="        ${S}=webhook[\"${S}\"],"
# Lazily-imported route components whose names contain "Password".
PW="Pass""word"
ALLOWED_ROUTES=(
  "const Forgot${PW} = lazy(() => import(\"./pages/Forgot${PW}\"))"
  "const Reset${PW} = lazyWithRetry(() => import(\"./pages/Reset${PW}\"))"
)
# Settings demo/placeholder lines (see _SETTINGS_DEMO_REF).
SC="Sec""ret"; LSC="sec""ret"; AK="API_""KEY"; RND='${Math.random().toString(36).substring(2, 15)}'
ALLOWED_SETTINGS=(
  "        const generated${SC} = \`sk_forge_${RND}_${RND}\`;"
  "            <span>export FORGE_${AK}=&quot;sk_forge_...&quot; && forge build</span>"
  '          qr_code_url: `otpauth://totp/Forge:${user?.email || "developer"}?'"${LSC}"'=${'"${LSC}"'}&issuer=Forge`,'
)
# auth.py MFA lines (see _MFA_SECRET_REF).
ALLOWED_MFA=(
  "    ${S} = pyotp.random_base32()"
  "    return MfaSetupResponse(${S}=${S}, otpauth_uri=otpauth_uri)"
  "    encrypted_${S} = user_doc.get(\"totp_${S}\") if user_doc else None"
  "    encrypted_${S} = user_doc.get(\"totp_${S}\")"
  "        ${S} = decrypt_field(encrypted_${S})"
)

MUST_FLAG=(
  "        ${S}=${FAKE},"                              # literal value
  "        ${S}=webhook[\"${S}\"], token=${FAKE}"      # extra code after the expression
  "        ${S}=webhook[\"${S}\"],  # ${W}${FAKE}"      # trailing comment with a secret-shaped value
  "        ${S}=webhook[\"${S}\"]"                     # modified: no trailing comma
  "        ${S} = webhook[\"${S}\"],"                  # modified: spaces around =
  "        ${S}=webhooks[\"${S}\"],"                   # different source
  "        ${S}=webhook[\"token\"],"                   # different field
  "    x = f(${S}=webhook[\"${S}\"],"                  # expression not alone on the line
  "${W}${FAKE}"                                        # bare signing-secret-shaped value
  "${P}=${FAKE}"                                       # unrelated pattern still active
  "  key: ${CF}${FAKE20}"                              # Cashfree key shape
  "  key: ${CFL}${FAKE20}"                             # Cashfree key shape (long prefix)
  "const Reset${PW} = lazyLoad(() => ${FAKE})"         # route-name rule: other wrapper
  "        const generated${SC} = \`${FAKE}\`;"                       # settings rule: literal value
  "            <span>export FORGE_${AK}=&quot;sk_forge_${FAKE}&quot; && forge build</span>"  # real-looking key
  "          qr_code_url: \`otpauth://totp/Forge:x?${LSC}=${FAKE}&issuer=Forge\`,"           # literal TOTP secret
  "    ${S} = ${FAKE}"                                              # MFA rule: literal value
  "    ${S} = pyotp.random_base32() or ${FAKE}"                     # MFA rule: trailing literal
  "    return MfaSetupResponse(${S}=${FAKE}, otpauth_uri=otpauth_uri)"  # MFA rule: literal in response
  "        ${S} = decrypt_field(encrypted_${S}) or ${FAKE}"         # MFA rule: trailing literal
  "    encrypted_${S} = user_doc.get(\"totp_${S}\") or ${FAKE}"     # MFA rule: literal fallback
)

for src in "$HOOK" "$WF"; do
  name=${src#"$ROOT/"}
  if [ "$src" = "$HOOK" ]; then dc=':[[:space:]]*#'; else dc='^[0-9]+:[[:space:]]*#'; fi
  echo "== $name"

  out=$(printf '%s\n' "$ALLOWED" | scan_with "$src" "$dc")
  if [ -z "$out" ]; then ok "allowed expression is not flagged"; else bad "allowed expression was flagged"; fi

  for r in "${ALLOWED_SETTINGS[@]}"; do
    out=$(printf '%s\n' "$r" | scan_with "$src" "$dc")
    if [ -z "$out" ]; then ok "settings line not flagged: ${r:8:40}"; else bad "settings line flagged: ${r:8:40}"; fi
  done

  for r in "${ALLOWED_MFA[@]}"; do
    out=$(printf '%s\n' "$r" | scan_with "$src" "$dc")
    if [ -z "$out" ]; then ok "MFA line not flagged: ${r:4:40}"; else bad "MFA line flagged: ${r:4:40}"; fi
  done

  for r in "${ALLOWED_ROUTES[@]}"; do
    out=$(printf '%s\n' "$r" | scan_with "$src" "$dc")
    if [ -z "$out" ]; then ok "route import not flagged: ${r:0:40}"; else bad "route import flagged: ${r:0:40}"; fi
  done

  for i in "${!MUST_FLAG[@]}"; do
    out=$(printf '%s\n' "${MUST_FLAG[$i]}" | scan_with "$src" "$dc")
    if [ -n "$out" ]; then ok "probe $((i + 1)) flagged"; else bad "probe $((i + 1)) NOT flagged"; fi
  done
done

if [ "$FAIL" -ne 0 ]; then echo "RESULT: FAIL"; exit 1; fi
echo "RESULT: PASS"
