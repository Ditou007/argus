/**
 * Minimal structured logger: every line is JSON with an `event` field and a
 * level, so logs are queryable events rather than free-text prints. No
 * dependency — the demo agent stays self-contained.
 */

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
}

const emit = (level: string, event: string, fields: LogFields | undefined): void => {
  const line = JSON.stringify({ level, event, ...fields });
  // Single sink for the structured line; not a free-text console print.
  process.stdout.write(`${line}\n`);
};

export const logger: Logger = {
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
};
