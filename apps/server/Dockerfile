FROM node:24-slim

WORKDIR /usr/src/app

# Workspace manifests first so the dependency layer is cached between code changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/extension/package.json apps/extension/

RUN npm ci --workspace=@watch-party/shared --workspace=@watch-party/server --include-workspace-root

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build:server

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
