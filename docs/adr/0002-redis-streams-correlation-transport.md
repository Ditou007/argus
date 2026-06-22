# ADR 0002 — Redis Streams as the correlation firehose transport

**Status:** Accepted · **Date:** 2026-06-22 · **Deciders:** Argus maintainer · **Context:** SPEC_04 Slice 2b

## Context

SPEC_04 turns the correlator into a streaming consumer (ADR 0001 direction). The streaming
correlator must see **every** captured event, with its **full `raw_event`** (the network/file
signals read `sock_arg`/`file_arg`), and must not lose events across a restart (forensic-first: a
dropped event is a hole in the audit record).

Today ingestion publishes a **lightweight** notification to the Redis pub/sub channel `argus:events`
(id, pid, binary, function_name, …) — consumed by the WebSocket live view and the dashboard. It does
**not** carry `raw_event`.

Three ways to feed the streaming correlator were considered:

1. **Add `raw_event` to the existing pub/sub channel.** Simplest, but pub/sub is fire-and-forget:
   no durability, no backpressure, no replay. A slow or restarting consumer **silently drops**
   events — unacceptable for a forensic audit record, and it makes rehydrate-on-restart impossible.
2. **Fetch the full event from ClickHouse per notification.** A read on the hot path, racy against
   the write (publish happens before the ClickHouse mirror write completes), and the ClickHouse
   `events` table has no lookup key (the Redis `id` is the Postgres id). Chatty and fragile.
3. **A durable, replayable log carrying the full event, consumed via a consumer group.** How
   real streaming systems do it (Kafka/Redpanda in observability pipelines; consumer groups with
   offsets). Redis is already in the stack and **Redis Streams** is exactly this primitive.

## Decision

**Carry the full-event firehose to the correlator on a durable Redis Stream (`argus:events:stream`)
consumed via a consumer group; keep the lightweight `argus:events` pub/sub unchanged for the
dashboard/WS.**

- Ingestion `XADD`s the full event to `argus:events:stream` **in addition to** the existing
  lightweight `PUBLISH argus:events` (additive — the dashboard/WS path is untouched).
- The streaming correlator reads the stream via a **consumer group** (`XREADGROUP`): at-least-once
  delivery, per-consumer offsets, backpressure, and **replay of unacked entries on restart**.
- Open/close of declared-action windows is driven in-process from the action lifecycle
  (`packages/api/src/routes/sessions.ts`); `ingestEvent` is driven by the stream consumer.
- **Rehydrate-on-restart** (the ADR 0001 / SPEC_04 requirement) is satisfied by: the consumer group
  redelivering unacked stream entries **plus** rebuilding open windows from Postgres
  (`agent_actions WHERE ended_at IS NULL`) and their accumulated events from ClickHouse.

## Options considered

- **Pub/sub of full events (option 1)** — rejected: lossy at firehose scale; no replay; breaks the
  forensic guarantee and rehydrate.
- **Per-event ClickHouse fetch (option 2)** — rejected: hot-path read, publish/write race, no key.
- **Kafka/Redpanda** — rejected for now: correct but heavy new infra for a single-host
  `docker compose` product; Redis Streams gives the same semantics we need with zero new services.

## Consequences

- **Positive:** no dropped events (durable + acked); replayable; rehydrate falls out of consumer-group
  offsets; no new infrastructure; the dashboard/WS path is unchanged; the firehose stays off Postgres.
- **Costs / risks:** more Redis memory/bandwidth (the stream carries full events — bounded with
  `MAXLEN ~` capping the stream length, since ClickHouse is the durable record, not Redis); a second
  publish per event in ingestion; consumer-group plumbing (ack/claim) to get right. The stream is a
  transport buffer, **not** the system of record — ClickHouse holds the durable trace.

## Follow-ups

SPEC_04 Slice 2b implements the stream publish + consumer + trace persistence; Slice 2c implements
full rehydrate-on-restart. Stream `MAXLEN` capping and dead-consumer claim are tuned there.
