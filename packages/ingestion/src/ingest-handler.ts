import type { TetragonEvent } from "./types.js";

/** A destination the ingestion path writes raw events to. */
export interface EventSink {
  insert: (event: TetragonEvent) => Promise<void>;
}

export interface IngestHandlerDeps {
  /** System of record. A failure here propagates (the event must not be silently dropped). */
  readonly primary: EventSink;
  /** Additive mirror (ClickHouse). A failure here is swallowed so it never breaks the primary. */
  readonly mirror: EventSink;
  readonly shouldIngest: (event: TetragonEvent) => boolean;
  readonly onMirrorError: (err: unknown) => void;
}

/**
 * Build the dual-write ingestion handler. Filtered events touch neither sink.
 * For an ingested event the primary write runs (and propagates on failure),
 * then the mirror write runs additively — a mirror failure is reported via
 * onMirrorError but never breaks the primary path (SPEC_04 Slice 1 invariant).
 * @function createIngestHandler
 * @param deps - the primary/mirror sinks, the ingest filter, and the mirror-error reporter
 * @returns an async handler that returns whether the event was ingested
 */
export const createIngestHandler = (deps: IngestHandlerDeps) => {
  return async (event: TetragonEvent): Promise<{ ingested: boolean }> => {
    if (!deps.shouldIngest(event)) {
      return { ingested: false };
    }
    await deps.primary.insert(event);
    await deps.mirror.insert(event).catch(deps.onMirrorError);
    return { ingested: true };
  };
};
