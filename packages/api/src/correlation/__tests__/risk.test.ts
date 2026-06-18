import { describe, it, expect } from "vitest";
import {
  riskScore,
  sensitivityOf,
  parseSensitivityProfile,
  DEFAULT_SENSITIVITY_PROFILE,
  type SensitivityProfile,
} from "../risk.js";
import { extractResource } from "../resource.js";

const fileEvent = (path: string) => ({ process_kprobe: { args: [{ file_arg: { path } }] } });
const netEvent = (daddr: string, dport = 443) => ({
  process_kprobe: { args: [{ sock_arg: { daddr, dport } }] },
});

describe("risk scoring", () => {
  it("ranks an unexplained credential read above an unexplained /tmp write", () => {
    const cred = riskScore(0, fileEvent("/root/.ssh/id_rsa"));
    const tmp = riskScore(0, fileEvent("/tmp/scratch.dat"));
    expect(cred).toBeGreaterThan(tmp);
    expect(cred).toBe(1.0); // high (1.0) × fully unexplained (1 − 0)
    expect(tmp).toBeCloseTo(0.1); // low (0.1) × 1
  });

  it("grades by how unexplained the event is (1 − best_confidence)", () => {
    const orphan = riskScore(0, fileEvent("/root/.ssh/id_rsa")); // 1.0 × 1.0
    const nearMiss = riskScore(0.6, fileEvent("/root/.ssh/id_rsa")); // 1.0 × 0.4
    expect(orphan).toBeGreaterThan(nearMiss);
    expect(nearMiss).toBeCloseTo(0.4);
  });

  describe("sensitivity tiers", () => {
    const tier = (raw: Record<string, unknown>, allow?: string[]) =>
      sensitivityOf(extractResource(raw), DEFAULT_SENSITIVITY_PROFILE, allow);

    it("classes credential globs as HIGH", () => {
      expect(tier(fileEvent("/home/u/.aws/credentials"))).toBe("high");
      expect(tier(fileEvent("/etc/shadow"))).toBe("high");
      expect(tier(fileEvent("/srv/tls/server.pem"))).toBe("high");
    });

    it("classes /tmp and /proc/self as LOW, other paths MEDIUM", () => {
      expect(tier(fileEvent("/tmp/x"))).toBe("low");
      expect(tier(fileEvent("/proc/self/status"))).toBe("low");
      expect(tier(fileEvent("/app/data/report.json"))).toBe("medium");
    });

    it("classes a connect to a non-allowlisted dest HIGH, allowlisted LOW", () => {
      expect(tier(netEvent("203.0.113.9"))).toBe("high");
      expect(tier(netEvent("203.0.113.9"), ["203.0.113.9"])).toBe("low");
    });
  });

  describe("configurable profile", () => {
    it("a consumer profile demoting ~/.ssh to LOW changes the score", () => {
      const custom: SensitivityProfile = {
        ...DEFAULT_SENSITIVITY_PROFILE,
        credentialPathGlobs: [],
        lowSensitivityPathPrefixes: ["/root/.ssh/"],
      };
      expect(sensitivityOf(extractResource(fileEvent("/root/.ssh/id_rsa")), custom)).toBe("low");
      expect(riskScore(0, fileEvent("/root/.ssh/id_rsa"), custom)).toBeCloseTo(0.1);
    });
  });

  describe("profile validation", () => {
    it("accepts the shipped default", () => {
      expect(() => parseSensitivityProfile(DEFAULT_SENSITIVITY_PROFILE)).not.toThrow();
    });

    it("rejects a non-object, bad weights, and an invalid tier", () => {
      expect(() => parseSensitivityProfile("nope")).toThrow();
      expect(() =>
        parseSensitivityProfile({ ...DEFAULT_SENSITIVITY_PROFILE, tierWeights: { high: 2, medium: 0.5, low: 0.1 } })
      ).toThrow(/tierWeights\.high/);
      expect(() =>
        parseSensitivityProfile({ ...DEFAULT_SENSITIVITY_PROFILE, defaultFileTier: "extreme" })
      ).toThrow(/defaultFileTier/);
    });
  });
});
