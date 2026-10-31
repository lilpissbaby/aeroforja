# syntax=docker/dockerfile:1
#
# AeroForja as a static site: the build stage compiles the app and runs the
# type checks and the physics validation tests (a core that fails its
# published reference cases never ships); the final stage is plain nginx
# serving the files. All computing happens in the browser.

FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable

# Dependencies first, so code changes reuse the cached install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/app/package.json packages/app/
COPY packages/physics/package.json packages/physics/
COPY packages/validation/package.json packages/validation/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm check && pnpm build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/packages/app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
