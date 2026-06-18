import { describe, it, expect } from "vitest";
import { declaredEgressDestinations, buildEgressAllowlist } from "../egress.js";
import { sensitivityOf, DEFAULT_SENSITIVITY_PROFILE, type SensitivityProfile } from "../risk.js";
import { extractResource } from "../resource.js";
import type { ActionHints } from "../types.js";

const hint = (over: Partial<ActionHints>): ActionHints => ({
  action_type: "network_request",
  action_name: null,
  expected_hostnames: [],
  expected_ips: [],
  expected_ports: [],
  expected_file_paths: [],
  expected_functions: [],
  agent_pid: 1,
  pod_name: null,
  ...over,
});

const connect = (daddr: string) => extractResource({ process_kprobe: { args: [{ sock_arg: { daddr, dport: 443 } }] } });

describe("egress allowlist (declared ∪ config)", () => {
  it("collects declared destinations from network actions only", () => {
    const hints = [
      hint({ action_type: "network_request", expected_ips: ["1.1.1.1"] }),
      hint({ action_type: "llm_call", expected_ips: ["2.2.2.2"] }),
      hint({ action_type: "file_read", expected_ips: ["9.9.9.9"] }), // not a network action — ignored
    ];
    expect(declaredEgressDestinations(hints).sort()).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  it("unions declared with the config baseline", () => {
    const profile: SensitivityProfile = { ...DEFAULT_SENSITIVITY_PROFILE, egressAllowlist: ["8.8.8.8"] };
    expect(buildEgressAllowlist(["1.1.1.1"], profile).sort()).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("declared → not HIGH, config → not HIGH, neither → HIGH", () => {
    const profile: SensitivityProfile = { ...DEFAULT_SENSITIVITY_PROFILE, egressAllowlist: ["8.8.8.8"] };
    const allow = buildEgressAllowlist(["1.1.1.1"], profile);
    expect(sensitivityOf(connect("1.1.1.1"), profile, allow)).toBe("low"); // declared
    expect(sensitivityOf(connect("8.8.8.8"), profile, allow)).toBe("low"); // config
    expect(sensitivityOf(connect("203.0.113.7"), profile, allow)).toBe("high"); // neither
  });
});
