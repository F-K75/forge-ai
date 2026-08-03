#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "🔍 Scanning git history for secret-containing files..."

# Files that historically contained production secrets
SECRET_FILES=(
  "render.yaml"
  "docker-compose.prod.yml"
  "k8s/secrets.yaml"
  ".env"
)

echo "📋 Found secret-containing files: ${SECRET_FILES[*]}"

# Check if git-filter-repo is available
if ! command -v git-filter-repo &>/dev/null; then
  echo "❌ git-filter-repo is not installed."
  echo "   Install: pip3 install git-filter-repo"
  echo "   Or: brew install git-filter-repo"
  exit 1
fi

# Create a temporary replacements file
REPLACEMENTS_FILE=$(mktemp)
trap "rm -f $REPLACEMENTS_FILE" EXIT

cat > "$REPLACEMENTS_FILE" <<'EOF'
# MongoDB
mongodb://[^[:space:]]+:[^@[:space:]]+@ ==> mongodb://<REDACTED>@
mongodb\+srv://[^[:space:]]+:[^@[:space:]]+@ ==> mongodb+srv://<REDACTED>@

# Redis
redis://:[^@[:space:]]+@ ==> redis://:<REDACTED>@

# Stripe
sk_live_[a-zA-Z0-9]{10,} ==> sk_live_<REDACTED>
sk_test_[a-zA-Z0-9]{10,} ==> sk_test_<REDACTED>
pk_live_[a-zA-Z0-9]{10,} ==> pk_live_<REDACTED>
pk_test_[a-zA-Z0-9]{10,} ==> pk_test_<REDACTED>
whsec_[a-zA-Z0-9]{10,} ==> whsec_<REDACTED>

# Cashfree
cf_[a-zA-Z0-9]{20,} ==> cf_<REDACTED>
cashfree_[a-zA-Z0-9]{20,} ==> cashfree_<REDACTED>

# JWT / encryption
JWT_SECRET=.* ==> JWT_SECRET=<REDACTED>
FIELD_ENCRYPTION_KEY=.* ==> FIELD_ENCRYPTION_KEY=<REDACTED>

# Generic
[Pp]assword[[:space:]]*=[[:space:]]*[^"[:space:]]{6,} ==> Password=<REDACTED>
[Ss]ecret[[:space:]]*=[[:space:]]*[^"[:space:]]{6,} ==> Secret=<REDACTED>
[Aa][Pp][Ii]_[Kk][Ee][Yy][[:space:]]*=[[:space:]]*[^"[:space:]]{6,} ==> API_KEY=<REDACTED>
EOF

echo ""
echo "🚨 WARNING: This will rewrite git history and remove the above files from all commits."
echo "   You will need to force-push and all collaborators will need to re-clone."
echo ""
read -p "Have you rotated all affected credentials? (yes/no): " ROTATED
if [ "$ROTATED" != "yes" ]; then
  echo "❌ Aborting. Please rotate credentials first, then re-run this script."
  exit 1
fi

echo ""
echo "🧹 Purging secrets from git history..."

# Use git filter-repo to redact secrets from specific files
git filter-repo \
  --path render.yaml \
  --path docker-compose.prod.yml \
  --path k8s/secrets.yaml \
  --path .env \
  --replace-text "$REPLACEMENTS_FILE" \
  --force

echo ""
echo "✅ Secret purge complete."
echo ""
echo "Next steps:"
echo "1. Verify the files are clean:"
echo "   git log --all --pretty=format:'%h %s' -- render.yaml"
echo ""
echo "2. Force-push to remote:"
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "3. Tell all collaborators to re-clone or reset:"
echo "   git fetch origin"
echo "   git reset --hard origin/<branch>"
echo ""
echo "4. Run secret-scanning CI to verify:"
echo "   git secrets --scan-history"
