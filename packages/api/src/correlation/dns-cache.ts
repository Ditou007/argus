import dns from "node:dns/promises";

interface CacheEntry {
  ips: string[];
  expires: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 1000;
const RESOLVE_TIMEOUT_MS = 2000;

/** Injectable resolver + cap (defaults to real DNS) — lets tests drive eviction deterministically. */
interface DnsCacheDeps {
  resolve4?: (hostname: string) => Promise<string[]>;
  maxEntries?: number;
}

/**
 * Build the TTL DNS cache used to resolve a declared action's expected hostnames
 * to IPs (and reverse-lookup an IP to a hostname). Both the forward and reverse
 * maps are bounded to `maxEntries`, evicting oldest-first together.
 * @function createDnsCache
 * @param deps - optional injected `resolve4` and `maxEntries` (default real DNS / 1000)
 * @returns the cache API: resolveHostname, resolveAll, getHostnameForIp
 */
export const createDnsCache = (deps: DnsCacheDeps = {}) => {
  const resolve4 = deps.resolve4 ?? dns.resolve4;
  const maxEntries = deps.maxEntries ?? MAX_ENTRIES;
  const cache = new Map<string, CacheEntry>();
  // Reverse map: IP -> hostname
  const reverseCache = new Map<string, string>();

  // Keep the forward cache at/under maxEntries, evicting oldest-first — and drop
  // each evicted entry's reverse-cache IPs, or reverseCache would grow without
  // bound while the forward cache stays capped (the memory leak this fixes).
  const evictToCap = () => {
    while (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (!firstKey) return;
      const evicted = cache.get(firstKey);
      cache.delete(firstKey);
      for (const ip of evicted?.ips ?? []) {
        // Only drop the reverse entry if it still points at the evicted host —
        // a newer hostname may have taken ownership of a shared IP.
        if (reverseCache.get(ip) === firstKey) reverseCache.delete(ip);
      }
    }
  };

  const resolveHostname = async (hostname: string): Promise<string[]> => {
    // Check cache
    const cached = cache.get(hostname);
    if (cached && cached.expires > Date.now()) {
      return cached.ips;
    }

    // Resolve with timeout
    try {
      const ips = await Promise.race([
        resolve4(hostname),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error("DNS timeout")), RESOLVE_TIMEOUT_MS)
        ),
      ]);

      cache.set(hostname, { ips, expires: Date.now() + TTL_MS });
      // Update reverse cache, then evict down so both maps stay bounded together.
      for (const ip of ips) {
        reverseCache.set(ip, hostname);
      }
      evictToCap();

      return ips;
    } catch {
      // Cache the failure too (with shorter TTL) to avoid hammering
      cache.set(hostname, { ips: [], expires: Date.now() + 30_000 });
      return [];
    }
  };

  const resolveAll = async (hostnames: string[]): Promise<string[]> => {
    const results = await Promise.all(hostnames.map(resolveHostname));
    return results.flat();
  };

  const getHostnameForIp = (ip: string): string | null =>
    reverseCache.get(ip) ?? null;

  return { resolveHostname, resolveAll, getHostnameForIp };
};
