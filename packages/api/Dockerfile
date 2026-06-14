# Multi-stage build for Argus API
# Build context: monorepo root

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/
COPY packages/ingestion/package.json packages/ingestion/

RUN pnpm install --frozen-lockfile
COPY packages/api/ packages/api/
RUN pnpm --filter @argus/api build

# --- Runtime: use the full workspace so module resolution works ---
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/api/package.json packages/api/
COPY --from=builder /app/packages/ingestion/package.json packages/ingestion/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/api/dist packages/api/dist/
COPY --from=builder /app/packages/api/package.json packages/api/

WORKDIR /app/packages/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
