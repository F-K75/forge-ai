# TODO - P0 Remediation (production-safe)

- [ ] Backend: enforce authenticated WebSocket connections (authenticate before accept)
- [ ] Backend: verify build ownership/foreign build rejection on every WS session
- [ ] Backend: fix credit deduction race with atomic MongoDB conditional update
- [ ] Backend: remove Docker socket mount from docker-compose
- [ ] Backend: remove `--reload` from backend production Dockerfile
- [ ] Backend: secure Docker build context (ensure secrets excluded via .dockerignore and Dockerfile)
- [ ] Frontend: remove demo-mode auto-login fallback
- [ ] Frontend: remove any frontend-only admin auth assumptions; ensure admin checks via backend
- [ ] Frontend: wire forgot-password + reset-password flows
- [ ] Deployment: fix preview URLs to use configured app host (not localhost)
- [ ] Security: add request/body/file/document size limits, timeouts around Anthropic/Docker
- [ ] Tests: add/extend tests for every P0 fix

