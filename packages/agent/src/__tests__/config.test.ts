import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../config.js";

const KEYS = ["AGENT_PORT", "ARGUS_API_URL", "AGENT_NAME", "AGENT_WORK_DIR"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("loadConfig", () => {
  it("falls back to demo defaults when env is unset", () => {
    for (const k of KEYS) delete process.env[k];
    expect(loadConfig()).toEqual({
      port: 4001,
      argusApiUrl: "http://localhost:3001",
      agentName: "demo-chatbot",
      workDir: "/workspace",
    });
  });

  it("reads overrides from the environment", () => {
    process.env.AGENT_PORT = "5005";
    process.env.ARGUS_API_URL = "http://api:3001";
    process.env.AGENT_NAME = "custom";
    expect(loadConfig()).toMatchObject({ port: 5005, argusApiUrl: "http://api:3001", agentName: "custom" });
  });
});
