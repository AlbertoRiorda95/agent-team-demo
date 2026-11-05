# Orders service image. Build context: the repository root (npm workspaces):
#   docker build -f services/orders/Dockerfile -t orders:local .
# Alpine, not Debian: the Debian base carries unfixed HIGH/CRITICAL OS CVEs
# (util-linux, zlib) that fail the Trivy gate. The base image is pinned to a tag; pin it by digest (node:<tag>@sha256:...)
# once resolved with `docker buildx imagetools inspect` (see the MR).
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/orders/package.json services/orders/
COPY apps/web/package.jso[n] apps/web/
# typescript is a root devDependency: -w alone would skip it (tsc: exit 127)
# @albertoriorda95/money comes from GitHub Packages: the user npm config written
# by ./ci/registry.sh login is mounted as a build secret (id npmrc), only for
# this step, so the token is never in a layer or in the build context:
#   docker build --secret id=npmrc,src="$(npm config get userconfig)" ...
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --ignore-scripts -w services/orders --include-workspace-root
COPY tsconfig.base.json ./
COPY services/orders/ services/orders/
RUN npm run build -w services/orders

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/orders/package.json services/orders/
COPY apps/web/package.jso[n] apps/web/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --ignore-scripts --omit=dev -w services/orders

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000
WORKDIR /app/services/orders
COPY --from=deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/services/orders/dist ./dist
COPY --from=build --chown=node:node /app/services/orders/openapi.yaml /app/services/orders/package.json ./
COPY --from=build --chown=node:node /app/services/orders/migrations ./migrations
# The runtime needs only node: drop npm, npx and corepack (their bundled
# packages carry HIGH CVEs flagged by Trivy and nothing here uses them).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/bin/corepack
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
