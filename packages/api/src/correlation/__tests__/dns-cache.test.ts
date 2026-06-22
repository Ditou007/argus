import { describe, it, expect } from "vitest";
import { createDnsCache } from "../dns-cache.js";

describe("createDnsCache — reverse-cache eviction", () => {
  it("resolves and supports reverse lookup", async () => {
    const cache = createDnsCache({ resolve4: async () => ["1.1.1.1"] });
    expect(await cache.resolveHostname("a.example")).toEqual(["1.1.1.1"]);
    expect(cache.getHostnameForIp("1.1.1.1")).toBe("a.example");
  });

  it("evicts reverse entries when the forward entry is evicted (no unbounded growth)", async () => {
    // Each hostname resolves to a distinct IP; cap the cache at 2 entries.
    const cache = createDnsCache({
      maxEntries: 2,
      resolve4: async (h: string) => [`10.0.0.${h}`],
    });
    await cache.resolveHostname("1"); // -> 10.0.0.1
    await cache.resolveHostname("2"); // -> 10.0.0.2
    await cache.resolveHostname("3"); // -> 10.0.0.3, evicts oldest ("1")

    // The evicted hostname's reverse entry must be gone — not leaked forever.
    expect(cache.getHostnameForIp("10.0.0.1")).toBeNull();
    // Live entries' reverse lookups still work.
    expect(cache.getHostnameForIp("10.0.0.2")).toBe("2");
    expect(cache.getHostnameForIp("10.0.0.3")).toBe("3");
  });

  it("does not evict a reverse entry that another live hostname now owns", async () => {
    // Two hostnames share an IP; evicting the first must not drop the IP the
    // second still owns.
    const ipByHost: Record<string, string[]> = { a: ["9.9.9.9"], b: ["9.9.9.9"], c: ["8.8.8.8"] };
    const cache = createDnsCache({ maxEntries: 2, resolve4: async (h: string) => ipByHost[h] });
    await cache.resolveHostname("a"); // 9.9.9.9 -> a
    await cache.resolveHostname("b"); // 9.9.9.9 -> b (reverse now points to b)
    await cache.resolveHostname("c"); // evicts "a"; 9.9.9.9 still owned by live "b"
    expect(cache.getHostnameForIp("9.9.9.9")).toBe("b");
  });
});
