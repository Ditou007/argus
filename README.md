# Argus

**AI Agent Runtime Governance & Observability Platform**

Argus monitors autonomous AI agents at the OS level using eBPF (via Cilium Tetragon), correlates kernel-level syscall traces with LLM API calls, and enforces runtime governance policies.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent (LLM)                       │
│              (makes API calls, file I/O,                │
│               network requests, etc.)                   │
└──────────────────────┬──────────────────────────────────┘
                       │ OS-level syscalls
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Cilium Tetragon (eBPF)                     │
│         Kernel-level event capture & export             │
└──────────────────────┬──────────────────────────────────┘
                       │ JSON events
                       ▼
┌─────────────────────────────────────────────────────────┐
│            Argus Ingestion Service                      │
│     Parses, classifies, stores Tetragon events          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────┐  ┌──────────┐  ┌─────────────────────────┐
│  PostgreSQL  │  │  Redis   │  │    Argus API Service     │
│   (events)   │  │ (state)  │  │   REST endpoints for     │
│              │  │          │  │   events, stats, search   │
└──────────────┘  └──────────┘  └────────────┬────────────┘
                                             │
                                             ▼
                                ┌─────────────────────────┐
                                │   Argus Dashboard       │
                                │   (Next.js)             │
                                │   Event stream, filters │
                                │   Timeline, analytics   │
                                └─────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| eBPF Runtime | Cilium Tetragon |
| Event Pipeline | Node.js + TypeScript |
| API | Express |
| Database | PostgreSQL |
| Cache/State | Redis |
| Dashboard | Next.js + React |
| Infra | Docker Compose |

## Project Structure

```
argus/
├── packages/
│   ├── ingestion/     # Tetragon event consumer
│   ├── api/           # REST API service
│   └── dashboard/     # Next.js frontend
├── docker-compose.yml # Tetragon + Postgres + Redis
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, Tetragon)
docker compose up -d

# Start services
pnpm dev:ingestion  # Event ingestion
pnpm dev:api        # API on :3001
pnpm dev:dashboard  # Dashboard on :3000
```

## Roadmap

- [x] Month 1: eBPF syscall tracing + event ingestion + basic dashboard
- [ ] Month 2: Agent correlation (LLM calls ↔ syscall traces)
- [ ] Month 3: Risk scoring + policy enforcement + alerting
- [ ] Month 4: Deterministic replay + RBAC + multi-tenant
- [ ] Month 5: OpenTelemetry integration + benchmarks
- [ ] Month 6: Production polish + documentation

## License

MIT
