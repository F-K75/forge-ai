# SECRET HISTORY PURGE GUIDE

## Context
`render.yaml` previously contained hardcoded production secrets. The file has
been sanitized, but git history still contains the old values. Any secret that
was committed should be treated as compromised and rotated.

## Affected credentials
- MongoDB URI / password
- Redis password
- JWT secret
- Field encryption key
- Stripe keys (secret, publishable, webhook)
- Admin emails / API URLs

## Option A: git filter-repo (preferred)

1. Install git-filter-repo:
   - macOS: `brew install git-filter-repo`
   - Linux: `pip3 install git-filter-repo` or use your package manager

2. Run from the repo root:
   ```bash
   git filter-repo --path render.yaml --path backend/.env --path .env \
     --replace-text <(echo 'MONGODB_URL=.* ==> MONGODB_URL=<REDACTED>
   JWT_SECRET=.* ==> JWT_SECRET=<REDACTED>
   FIELD_ENCRYPTION_KEY=.* ==> FIELD_ENCRYPTION_KEY=<REDACTED>
   STRIPE_SECRET_KEY=.* ==> STRIPE_SECRET_KEY=<REDACTED>
   STRIPE_PUBLISHABLE_KEY=.* ==> STRIPE_PUBLISHABLE_KEY=<REDACTED>
   STRIPE_WEBHOOK_SECRET=.* ==> STRIPE_WEBHOOK_SECRET=<REDACTED>
   ADMIN_EMAILS=.* ==> ADMIN_EMAILS=<REDACTED>')
   ```

3. Force-push:
   ```bash
   git push origin --force --all
   ```

4. Tell all collaborators to re-clone or reset their local branches.

## Option B: BFG Repo Cleaner (simpler, but less flexible)

1. Download BFG: https://rtyley.github.io/bfg-repo-cleaner/

2. Run:
   ```bash
   java -jar bfg.jar --replace-text secrets-to-redact.txt --no-blob-protection
   git reflog expire --expire=now --all && git gc --prune=now --aggressive
   ```

3. Force-push as above.

## Option C: If rewriting history is not possible

If you cannot rewrite history (e.g. shared repo, PRs already merged), the
minimum safe action is:

1. Rotate every affected credential immediately.
2. Add the old values to your secret manager's revocation/rotation log.
3. Monitor for abuse of the old credentials (MongoDB Atlas logs, Stripe logs,
   server access logs).

## Post-purge checklist

- [ ] Rotate MongoDB credentials and update deploy config
- [ ] Rotate Redis password
- [ ] Rotate JWT secret and invalidate all existing sessions
- [ ] Rotate field encryption key
- [ ] Rotate Stripe keys and update webhook endpoint secret
- [ ] Verify `render.yaml` contains no hardcoded secrets
- [ ] Run secret-scanning CI on the rewritten history
