# Multi-stage build for Argus Ingestion Service
# Build context: monorepo root

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/api/package.json packages/api/

RUN pnpm install --frozen-lockfile
COPY packages/ingestion/ packages/ingestion/
RUN pnpm --filter @argus/ingestion build

# --- Runtime: use full workspace for pnpm module resolution ---
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/ingestion/package.json packages/ingestion/
COPY --from=builder /app/packages/api/package.json packages/api/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/ingestion/dist packages/ingestion/dist/
COPY --from=builder /app/packages/ingestion/package.json packages/ingestion/

# Copy migration SQL files and proto files
COPY --from=builder /app/packages/ingestion/src/migrations/*.sql packages/ingestion/dist/migrations/
COPY --from=builder /app/packages/ingestion/proto packages/ingestion/proto/

WORKDIR /app/packages/ingestion
CMD ["node", "dist/index.js"]
