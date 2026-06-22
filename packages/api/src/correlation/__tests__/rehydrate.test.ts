import { describe, it, expect } from "vitest";
import { rehydrateWindows } from "../rehydrate.js";
import type pg from "pg";

const fakePool = (rows: unknown[], captureSql?: (sql: string) => void): pg.Pool =>
  ({
    query: async (sql: string) => {
      captureSql?.(sql);
      return { rows };
    },
  }) as unknown as pg.Pool;

const opener = () => {
  const opened: { id: string; scope: { pod_name: string | null; agent_pid: number }; startedAt: Date }[] = [];
  return {
    service: { openAction: (id: string, scope: { pod_name: string | null; agent_pid: number }, startedAt: Date) => opened.push({ id, scope, startedAt }) },
    opened,
  };
};

describe("rehydrateWindows", () => {
  it("re-opens a window for each open action, with its session scope + start time", async () => {
    const { service, opened } = opener();
    const pool = fakePool([
      { id: "a1", started_at: "2026-06-22T00:00:00Z", pod_name: null, agent_pid: 4242 },
      { id: "a2", started_at: "2026-06-22T00:01:00Z", pod_name: "agent-x", agent_pid: 5 },
    ]);
    const count = await rehydrateWindows(pool, service);
    expect(count).toBe(2);
    expect(opened.map((o) => o.id)).toEqual(["a1", "a2"]);
    expect(opened[0].scope).toEqual({ pod_name: null, agent_pid: 4242 });
    expect(opened[1].scope).toEqual({ pod_name: "agent-x", agent_pid: 5 });
    expect(opened[0].startedAt).toBeInstanceOf(Date);
  });

  it("only selects un-ended actions (closed actions are not re-opened)", async () => {
    let sql = "";
    const { service } = opener();
    await rehydrateWindows(fakePool([], (s) => (sql = s)), service);
    expect(sql).toContain("ended_at IS NULL");
  });

  it("returns 0 when there are no open actions", async () => {
    const { service, opened } = opener();
    expect(await rehydrateWindows(fakePool([]), service)).toBe(0);
    expect(opened).toHaveLength(0);
  });
});
