# Contributing to Forge AI

Thank you for your interest in contributing to Forge AI! We welcome contributions from the community.

## Code of Conduct

Be respectful, inclusive, and constructive. Harassment of any kind will not be tolerated.

## How to Contribute

### Reporting Bugs
1. Check existing issues to avoid duplicates
2. Use the Bug Report template
3. Include clear reproduction steps and environment details

### Suggesting Features
1. Use the Feature Request template
2. Explain the problem you're solving
3. Describe the value to users

### Code Contributions

#### Getting Started
```bash
git clone https://github.com/F-K75/forge-ai.git
cd forge-ai
cp .env.example .env
# Configure your .env with required keys
./scripts/install-git-hooks.sh  # installs the pre-commit secret-scanning hook
```

#### Development Setup
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install

# Docker (full stack)
docker compose up
```

#### Local admin login

There is no shared default admin password. Admin access is a **DB flag**
(`users.is_admin`) plus MFA — not `VITE_ADMIN_EMAILS`.

1. Set `ADMIN_EMAILS` in `.env` (default `admin@forge.ai`).
2. Open `/signup` (or `/login` → create account) with an email on that list
   and a password of at least 12 characters that includes upper, lower,
   number, and a special character. Registration auto-sets `is_admin`.
3. Sign in at `/login`.
4. Enable two-factor authentication in **Settings**. Admin API routes
   (`admin_required`) return 403 until MFA is on; the UI sends you here
   if you open `/admin-console` first.
5. Open `/admin-console`. Later logins ask for a TOTP (or backup) code.

Use the same hostname for the app and `VITE_API_URL` (for example
`http://localhost:5173` with `http://localhost:8000`). Mixing `localhost` and
`127.0.0.1` drops the auth cookies.

To grant admin to an existing user whose email is **not** in `ADMIN_EMAILS`,
an already-admin account must call `PUT /admin/users/{user_id}/admin`.

#### Making Changes
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run tests:
   ```bash
   cd backend && pytest
   cd frontend && npm test
   cd frontend && npm run build
   ```
4. Ensure lint passes:
   ```bash
   cd backend && ruff check . --select F,E9 --exclude venv
   cd frontend && npm run lint
   ```
5. Commit with clear messages

#### Pull Request Process
1. Update documentation if needed
2. Add tests for new functionality
3. Ensure CI passes (backend tests, frontend tests, lint, build, secret-scanning)
4. Request review from maintainers

## Development Guidelines

### Code Style
- Python: Follow PEP 8, use type hints
- TypeScript: Follow project ESLint config
- Use meaningful variable names
- Write docstrings for public APIs

### Testing
- Backend: pytest with coverage (minimum 60% via `--cov-fail-under=60`)
- Frontend: Vitest (`npm test`)
- New features require tests
- Bug fixes require regression tests
- CI runs both backend and frontend test suites as blocking gates

### Deployment
- **Docker Compose**: `docker compose up` (dev), `docker compose -f docker-compose.prod.yml up` (prod)
- **Render**: `render.yaml` blueprint for backend-only deployment
- **Cloudflare Pages**: see `CLOUDFLARE_PAGES.md` for frontend deployment
- **Kubernetes**: reference manifests in `k8s/`

## Questions?

Open a Discussion or join our [Discord](https://discord.gg/forge-ai) (coming soon).
