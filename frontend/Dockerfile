# Build with the repository root as context:
#   docker build -f frontend/Dockerfile \
#     --build-arg VITE_API_URL=... --build-arg VITE_WS_URL=... .
#
# The app is an npm workspace (`frontend` in the root package.json), so
# `npm ci` must run against the root lockfile, not a nested one.

# Stage 1: build the SPA
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend

COPY frontend/ ./frontend/
WORKDIR /app/frontend

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_ADMIN_EMAILS
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS

# An unset VITE_WS_URL silently puts the app in mock-data mode (src/lib/env.ts),
# so refuse to build without the URLs.
RUN test -n "$VITE_API_URL" && test -n "$VITE_WS_URL" \
    || (echo "ERROR: VITE_API_URL and VITE_WS_URL build args are required" && exit 1)

# Run tsc+vite directly: a prebuild hook (when present) regenerates wsEvents.ts
# from the backend, which is unavailable in this build context. The generated
# file is committed, and CI runs the full npm build to catch contract drift.
RUN npx tsc && npx vite build

# Stage 2: serve with unprivileged nginx (UID 101, port 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine

# wget is needed for the HEALTHCHECK below; install without caching to keep
# the image small, then drop back to the non-root nginx user (UID 101).
USER root
RUN apk add --no-cache wget
USER 101

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:8080/healthz || exit 1
