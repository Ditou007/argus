# Multi-stage build for the Argus demo dashboard (Next.js)
# Build context: monorepo root

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/render/package.json packages/render/

RUN pnpm install --frozen-lockfile
COPY packages/render/ packages/render/
COPY packages/dashboard/ packages/dashboard/
# The browser (on the host) reaches the published ports, so the NEXT_PUBLIC_*
# defaults (localhost:3001 / :4001) are correct — no build args needed.
RUN pnpm --filter @argus/dashboard build

# --- Runtime ---
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/dashboard/package.json packages/dashboard/
COPY --from=builder /app/packages/render/package.json packages/render/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/dashboard/.next packages/dashboard/.next/
COPY --from=builder /app/packages/dashboard/next.config.js packages/dashboard/

WORKDIR /app/packages/dashboard
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "--port", "3000"]
