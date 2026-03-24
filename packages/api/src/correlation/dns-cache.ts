import dns from "node:dns/promises";

interface CacheEntry {
  ips: string[];
  expires: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 1000;
const RESOLVE_TIMEOUT_MS = 2000;

export const createDnsCache = () => {
  const cache = new Map<string, CacheEntry>();
  // Reverse map: IP -> hostname
  const reverseCache = new Map<string, string>();

  const evictIfFull = () => {
    if (cache.size <= MAX_ENTRIES) return;
    // Delete oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
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
        dns.resolve4(hostname),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error("DNS timeout")), RESOLVE_TIMEOUT_MS)
        ),
      ]);

      evictIfFull();
      cache.set(hostname, { ips, expires: Date.now() + TTL_MS });

      // Update reverse cache
      for (const ip of ips) {
        reverseCache.set(ip, hostname);
      }

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
