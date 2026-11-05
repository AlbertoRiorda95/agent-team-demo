# Web image: static Vite build served by unprivileged nginx (port 8080);
# /api and /health are proxied to the orders service (apps/web/nginx.conf).
# Build context: the repository root (npm workspaces):
#   docker build -f apps/web/Dockerfile -t web:local .
# Alpine bases, like the orders image (fewer OS CVEs for the Trivy gate).
# Pinned to a tag; pin by digest (image:<tag>@sha256:...) once resolved with
# `docker buildx imagetools inspect` (see the MR).
ARG NODE_IMAGE=node:24-alpine
ARG ALPINE_IMAGE=alpine:3.23

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY services/orders/package.jso[n] services/orders/
# The lockfile is shared with services/orders, which takes @albertoriorda95/money
# from GitHub Packages: the user npm config is mounted as a build secret (id
# npmrc), only for this step, never in a layer (see services/orders/Dockerfile).
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --ignore-scripts -w apps/web --include-workspace-root
COPY tsconfig.base.json ./
COPY apps/web/ apps/web/
RUN npm run build -w apps/web

FROM ${ALPINE_IMAGE}
# nginx comes from the Alpine repository (patched, unlike the nginx image's
# own build, which Trivy flags), with all OS packages upgraded. The package
# creates the `nginx` user; the config keeps pid and temp files under /tmp.
RUN apk upgrade --no-cache && apk add --no-cache nginx \
    && rm -rf /etc/nginx/http.d /etc/nginx/conf.d
COPY --from=build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
CMD ["nginx", "-g", "daemon off;"]
