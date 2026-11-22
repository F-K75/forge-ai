#!/usr/bin/env bash
# Ensure a Cloudflare Pages project exists, then write its public URL and the
# app's public URL to $GITHUB_OUTPUT (as `url` and `app_url`).
#
# Usage: cloudflare-pages-project.sh <project> <app-project> [app-url-override]
#
# Cloudflare gives a project <name>.pages.dev only if that subdomain is free;
# otherwise it adds a suffix (the app is forge-frontend-8gr.pages.dev). So the
# real URL is read from the API instead of guessed.
#
# Needs CLOUDFLARE_API_TOKEN (with Cloudflare Pages: Edit) and
# CLOUDFLARE_ACCOUNT_ID in the environment.
set -euo pipefail

project="$1"
app_project="$2"
app_url_override="${3:-}"
api="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects"
auth=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

get_project() {
  curl -sS -o "$tmp" -w '%{http_code}' "${auth[@]}" "$api/$1"
}

subdomain_url() {
  local sub
  sub="$(jq -r '.result.subdomain // empty' "$tmp")"
  if [ -z "$sub" ]; then
    echo "::error::Cloudflare returned no subdomain for project $1" >&2
    cat "$tmp" >&2
    exit 1
  fi
  echo "https://${sub}"
}

code="$(get_project "$project")"
if [ "$code" = "404" ]; then
  echo "Pages project '$project' doesn't exist yet; creating it."
  code="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "${auth[@]}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$project" '{name: $name, production_branch: "main"}')" \
    "$api")"
  if [ "$code" != "200" ]; then
    echo "::error::Creating Pages project '$project' failed (HTTP $code). The token needs Cloudflare Pages: Edit." >&2
    cat "$tmp" >&2
    exit 1
  fi
elif [ "$code" != "200" ]; then
  echo "::error::Looking up Pages project '$project' failed (HTTP $code)." >&2
  cat "$tmp" >&2
  exit 1
fi
url="$(subdomain_url "$project")"

if [ -n "$app_url_override" ]; then
  app_url="${app_url_override%/}"
else
  code="$(get_project "$app_project")"
  if [ "$code" != "200" ]; then
    echo "::error::Looking up the app's Pages project '$app_project' failed (HTTP $code)." >&2
    cat "$tmp" >&2
    exit 1
  fi
  app_url="$(subdomain_url "$app_project")"
fi

echo "Project URL: $url"
echo "App URL:     $app_url"
{
  echo "url=$url"
  echo "app_url=$app_url"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
