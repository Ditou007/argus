# Evaluation fixtures

Ground-truth data the correlation-accuracy harness measures against (SPEC_01).

## Files

- **`llm_call_decoy.json`** — a small hand-authored synthetic fixture (Slice 1). One `llm_call`, two
  true network syscalls, and a same-PID in-window `fd_install` decoy that must be rejected.
- **`corpus-real.json`** — a multi-action corpus curated from a **real** kind+Tetragon capture of
  `real_agent.py` (Slice 2). Real event shapes (arm64 syscalls, host PIDs, SDK instrumentation
  traffic), intent-labelled.
- **`raw/`** — the unedited capture (`actions.json`, `events.json`, `correlations.json`). Gitignored:
  it's a regenerable working artifact, not a committed fixture.

## Labelling rule (intent-based, engine-independent)

An event is a `true_match` for an action **only if it realizes that action's described intent**:

| Action | True match |
| --- | --- |
| `file_read` / `file_write` | `fd_install` on the exact path named in the action |
| `llm_call` / `network_request` | `tcp_connect`/`tcp_sendmsg` to the action's external destination IP |
| `tool_use` | `process_exec`/`process_exit` of the named command |

Everything else in-window is **noise** (`true_action_id: null`) — the SDK's own traffic to
`argus-api`, Python-interpreter reads (`/usr/lib/python…`, `/etc/ld.so.cache`), and pathless
`__arm64_sys_write` events. Genuinely ambiguous events (the overlapping GitHub/httpbin windows share
CDN IPs) are marked **`uncertain`** and excluded from precision/recall.

This labelling is deliberately **independent of the engine's scoring** — otherwise we'd be grading
the engine against its own logic.

## Reproducing the capture

```bash
pnpm k8s:setup
kubectl create secret generic llm-keys --from-literal=GROQ_API_KEY=gsk_...   # any supported provider
kubectl delete job real-agent --ignore-not-found && kubectl apply -f k8s/real-agent-job.yaml
kubectl wait --for=condition=complete job/real-agent --timeout=120s

# Export raw rows (pod name will differ — read it from the agent logs / events table):
PG=$(kubectl get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}')
# ... psql row_to_json dumps → packages/eval/fixtures/raw/{actions,events,correlations}.json

pnpm --filter @argus/eval curate    # runs packages/eval/src/curate.ts → fixtures/corpus-real.json
```

The curation rules live in `packages/eval/src/curate.ts` (`classifyEvent`) — adjust the destination
IPs / paths there if your run differs, and re-run. The labelling logic is unit-tested in
`packages/eval/src/curate.test.ts`.
