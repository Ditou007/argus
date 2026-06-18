/**
 * Egress allowlist for risk scoring: a network destination is "expected" for a
 * session if the agent **declared** it (via a `network_request` / `llm_call`
 * action) **or** it is on the static config baseline. An unexplained connect to
 * a destination in neither set is HIGH risk — scoring on the claim gap.
 *
 * The declared half is what makes this "Argus": the allowlist is derived from
 * the agent's own stated intent, not just a hand-maintained config list.
 */
import type { ActionHints } from "./types.js";
import type { SensitivityProfile } from "./risk.js";

const NETWORK_ACTIONS = new Set(["network_request", "llm_call"]);

/**
 * The destination IPs an agent declared across a session's network actions.
 * @function declaredEgressDestinations
 * @param hints - The parsed action hints for every action in the session.
 * @returns The unique set of declared destination IPs.
 */
export const declaredEgressDestinations = (hints: readonly ActionHints[]): string[] => {
  const ips = new Set<string>();
  for (const h of hints) {
    if (NETWORK_ACTIONS.has(h.action_type)) {
      for (const ip of h.expected_ips) ips.add(ip);
    }
  }
  return Array.from(ips);
};

/**
 * The effective egress allowlist for a session: declared destinations ∪ the
 * profile's static config baseline.
 * @function buildEgressAllowlist
 * @param declared - Destinations the agent declared (see {@link declaredEgressDestinations}).
 * @param profile - The active sensitivity profile (supplies the config baseline).
 * @returns The unique effective allowlist.
 */
export const buildEgressAllowlist = (
  declared: readonly string[],
  profile: SensitivityProfile
): string[] => Array.from(new Set([...declared, ...profile.egressAllowlist]));
