/**
 * Keep only the last `max` items of a list (a bounded tail / ring window).
 *
 * Client-side feeds that only ever append — the live syscall stream, chat
 * history — grow without bound and eventually freeze the browser (DOM + state).
 * Capping the in-memory tail keeps memory and render cost flat; the full record
 * still lives server-side (ClickHouse/Postgres) and is reachable via the API.
 * Returns a new array (never mutates the input).
 * @function capTail
 * @param items - the current list
 * @param max - maximum items to retain (<= 0 yields an empty list)
 * @returns the last `max` items (or all of them when fewer than `max`)
 */
export const capTail = <T>(items: readonly T[], max: number): T[] =>
  max <= 0 ? [] : items.slice(-max);
