import { describe, it, expect } from "vitest";
import {
  riskScore,
  sensitivityOf,
  parseSensitivityProfile,
  DEFAULT_SENSITIVITY_PROFILE,
  DEMO_SENSITIVITY_PROFILE,
  profileFromEnv,
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

    it("classes NODE runtime noise (node_modules at any depth) as LOW", () => {
      expect(tier(fileEvent("/app/node_modules/.pnpm/debug@2.6.9/package.json"))).toBe("low");
      expect(tier(fileEvent("/usr/local/lib/node_modules/npm/x.js"))).toBe("low");
    });

    it("classes PYTHON runtime noise (site-packages, __pycache__, .pyc, stdlib) as LOW", () => {
      // A python agent reads these at import — runtime noise, not agent behaviour.
      expect(tier(fileEvent("/usr/local/lib/python3.12/site-packages/requests/api.py"))).toBe("low");
      expect(tier(fileEvent("/app/.venv/lib/python3.13/site-packages/x.py"))).toBe("low");
      expect(tier(fileEvent("/usr/lib/python3/dist-packages/foo.py"))).toBe("low");
      expect(tier(fileEvent("/app/__pycache__/agent.cpython-312.pyc"))).toBe("low");
      expect(tier(fileEvent("/usr/lib/python3.12/os.py"))).toBe("low");
    });

    it("classes config/resolver noise (resolv.conf) as LOW but a real config HIGH/MEDIUM", () => {
      expect(tier(fileEvent("/etc/resolv.conf"))).toBe("low");
      // A genuine app file under /app is still MEDIUM (not blanket-lowered).
      expect(tier(fileEvent("/app/packages/agent/dist/index.js"))).toBe("medium");
    });

    it("classes universal runtime noise (shared libs, sysfs, benign /proc, TLS config) as LOW", () => {
      expect(tier(fileEvent("/usr/lib/libstdc++.so.6.0.34"))).toBe("low");
      expect(tier(fileEvent("/lib/x86_64-linux-gnu/libc.so.6"))).toBe("low");
      expect(tier(fileEvent("/sys/fs/cgroup/memory.max"))).toBe("low");
      expect(tier(fileEvent("/proc/cpuinfo"))).toBe("low");
      expect(tier(fileEvent("/proc/390484/auxv"))).toBe("low");
      expect(tier(fileEvent("/etc/ssl/openssl.cnf"))).toBe("low");
    });

    it("does NOT lower sensitive /proc (incl. self) or TLS private keys (no over-de-noising)", () => {
      // process environment/memory can hold secrets — must not be hidden as runtime noise,
      // for ANY pid including self.
      expect(tier(fileEvent("/proc/390484/environ"))).not.toBe("low");
      expect(tier(fileEvent("/proc/390484/mem"))).not.toBe("low");
      expect(tier(fileEvent("/proc/self/environ"))).not.toBe("low");
      expect(tier(fileEvent("/proc/self/mem"))).not.toBe("low");
      // a private key under /etc/ssl still wins via the credential glob.
      expect(tier(fileEvent("/etc/ssl/private/server.key"))).toBe("high");
    });

    it("classes a connect to a non-allowlisted dest HIGH, allowlisted LOW", () => {
      expect(tier(netEvent("203.0.113.9"))).toBe("high");
      expect(tier(netEvent("203.0.113.9"), ["203.0.113.9"])).toBe("low");
    });

    it("classes a loopback connect LOW regardless of allowlist (benign by destination)", () => {
      expect(tier(netEvent("127.0.0.1"))).toBe("low");
      expect(tier(netEvent("::1"))).toBe("low");
    });

    it("DEFAULT profile is conservative: only loopback LOW; private + link-local + public HIGH", () => {
      // A shipped default must NOT silently de-prioritise internal egress
      // (lateral movement) or link-local (169.254, cloud-metadata SSRF).
      expect(tier(netEvent("127.0.0.1"))).toBe("low");
      expect(tier(netEvent("172.22.0.5", 3001))).toBe("high"); // private — still HIGH by default
      expect(tier(netEvent("169.254.169.254"))).toBe("high"); // metadata SSRF — HIGH by default
      expect(tier(netEvent("1.1.1.1"))).toBe("high");
    });

    it("classes a bare-filename credential read HIGH", () => {
      expect(tier(fileEvent("server.pem"))).toBe("high");
    });
  });

  describe("demo profile (private-mesh de-noise, opt-in)", () => {
    const demoTier = (raw: Record<string, unknown>) =>
      sensitivityOf(extractResource(raw), DEMO_SENSITIVITY_PROFILE);

    it("quietens RFC1918 private ranges to LOW", () => {
      expect(demoTier(netEvent("172.22.0.5", 3001))).toBe("low"); // agent -> API on the bridge
      expect(demoTier(netEvent("10.1.2.3"))).toBe("low");
      expect(demoTier(netEvent("192.168.0.10"))).toBe("low");
    });

    it("keeps link-local (metadata SSRF) and public egress HIGH even in the demo", () => {
      expect(demoTier(netEvent("169.254.169.254"))).toBe("high");
      expect(demoTier(netEvent("1.1.1.1"))).toBe("high");
    });

    it("profileFromEnv selects demo only when ARGUS_SENSITIVITY_PROFILE=demo", () => {
      expect(profileFromEnv({ ARGUS_SENSITIVITY_PROFILE: "demo" })).toBe(DEMO_SENSITIVITY_PROFILE);
      expect(profileFromEnv({})).toBe(DEFAULT_SENSITIVITY_PROFILE);
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
