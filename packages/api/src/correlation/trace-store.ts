import { CORRELATED_TRACES_DDL, CORRELATED_TRACES_TABLE, toTraceRows } from "./correlated-traces.js";
import type { CorrelatedTrace } from "./streaming-correlator.js";
import type { ClickHouseWriter } from "./clickhouse-writer.js";

/**
 * Build the correlated-trace store over a ClickHouse writer. Lazily runs the
 * (idempotent) DDL on first persist so it self-heals if ClickHouse was
 * unreachable at startup.
 * @function createTraceStore
 * @param writer - the injected ClickHouse writer (real adapter or test fake)
 * @returns the store API: initialize, persist (one trace), close
 */
export const createTraceStore = (writer: ClickHouseWriter) => {
  let initialized = false;

  const initialize = async (): Promise<void> => {
    await writer.command(CORRELATED_TRACES_DDL);
    initialized = true;
  };

  const persist = async (trace: CorrelatedTrace): Promise<void> => {
    if (!initialized) await initialize();
    const rows = toTraceRows(trace);
    if (rows.length > 0) {
      await writer.insert(CORRELATED_TRACES_TABLE, rows);
    }
  };

  const close = (): Promise<void> => writer.close();

  return { initialize, persist, close };
};
