# Web image: static Vite build served by unprivileged nginx (port 8080);
# /api and /health are proxied to the orders service (apps/web/nginx.conf).
# Build context: the repository root (npm workspaces):
#   docker build -f apps/web/Dockerfile -t web:local .
# Alpine bases, like the orders image (fewer OS CVEs for the Trivy gate).
# Pinned to a tag; pin by digest (image:<tag>@sha256:...) once resolved with
# `docker buildx imagetools inspect` (see the MR).
ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY services/orders/package.jso[n] services/orders/
RUN npm ci --ignore-scripts -w apps/web --include-workspace-root
COPY tsconfig.base.json ./
COPY apps/web/ apps/web/
RUN npm run build -w apps/web

FROM ${NGINX_IMAGE}
COPY --from=build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
