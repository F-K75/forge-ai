# Stage 1: build the SPA
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

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

# Run tsc+vite directly: the npm prebuild hook regenerates wsEvents.ts from the
# backend, which is unavailable in this build context. The generated file is
# committed, and CI runs the full npm build to catch contract drift.
RUN npx tsc && npx vite build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

# Server config comes from /etc/nginx/templates/*.template mounted at runtime
# (the image's entrypoint substitutes ${DOMAIN} etc. via envsubst).
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80 443
