# Multi-stage build for the Argus demo chatbot agent
# Build context: monorepo root

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/agent/package.json packages/agent/

RUN pnpm install --frozen-lockfile
COPY packages/agent/ packages/agent/
RUN pnpm --filter @argus/agent build

# --- Runtime: full workspace so pnpm module resolution works ---
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/agent/package.json packages/agent/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/agent/dist packages/agent/dist/
COPY --from=builder /app/packages/agent/package.json packages/agent/

# Seed inert decoys so a malicious read/exfil produces REAL, captured syscalls
# (a failed open on a missing file emits no fd_install). Argus flags the read by
# its sensitive PATH (**/.ssh/**), not its content, so the decoy is plainly-fake
# text — benign by construction; the demo's "attack" reads/exfils only this.
RUN mkdir -p /root/.ssh /workspace \
  && printf '%s\n' 'ARGUS DEMO DECOY at a sensitive path — inert, not a real key.' > /root/.ssh/id_rsa \
  && chmod 600 /root/.ssh/id_rsa \
  && printf 'demo workspace notes\n' > /workspace/notes.txt

WORKDIR /app/packages/agent
EXPOSE 4001
CMD ["node", "dist/index.js"]
