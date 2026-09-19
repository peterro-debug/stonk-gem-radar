import { authorityRevoked, count, isFresh, numberValue, percentage } from "./risk-validation";

export type TrackerEvidence = {
  status: "not-configured" | "ok" | "unavailable" | "incomplete";
  error?: string;
  checkedAt?: number;
  bundledSupplyPct?: number;
  initialBundledSupplyPct?: number;
  sniperSupplyPct?: number;
  insiderSupplyPct?: number;
  mintAuthorityRevoked?: boolean;
  freezeAuthorityRevoked?: boolean;
  riskScore?: number;
  rugged?: boolean;
  flags: string[];
};

async function request(path: string, key: string): Promise<any> {
  const response = await fetch(`https://data.solanatracker.io${path}`, {
    headers: { "x-api-key": key, accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Solana Tracker HTTP ${response.status}`);
  return response.json();
}

export function parseTrackerEvidence(mint: string, token: any, bundles: any, now: number): TrackerEvidence {
  if (token?.token?.mint !== mint) return { status: "incomplete", error: "Token identity mismatch", flags: [] };
  const pools = Array.isArray(token.pools) ? token.pools.filter((p: any) => p?.tokenAddress === mint && isFresh(p.lastUpdated, now)) : [];
  if (!pools.length) return { status: "incomplete", error: "No fresh indexed pool for this mint", flags: [] };
  const risk = token.risk;
  if (!risk || !Array.isArray(risk.risks) || typeof risk.rugged !== "boolean") {
    return { status: "incomplete", error: "Incomplete risk report", flags: [] };
  }
  const groupPct = (group: any) => count(group?.count) != null && Array.isArray(group?.wallets)
    ? percentage(group.totalPercentage) : undefined;
  // The dedicated endpoint reports aggregate totals even though its wallet list is capped at 500.
  // An absent bundlers object or a 404 must never become a zero percentage.
  const bundledSupplyPct = count(bundles?.total) != null && Array.isArray(bundles?.wallets)
    ? percentage(bundles.percentage) : undefined;
  const sniperSupplyPct = groupPct(risk.snipers);
  const insiderSupplyPct = groupPct(risk.insiders);
  const authority = (field: string) => {
    const values = pools.map((p: any) => authorityRevoked(p.security, field));
    return values.includes(false) ? false : values.includes(true) ? true : undefined;
  };
  const flags = risk.risks.filter((r: any) => String(r?.level).toLowerCase() === "danger")
    .map((r: any) => `Solana Tracker danger: ${String(r.name || "token risk").slice(0, 160)}`);
  if (risk.rugged) flags.push("Solana Tracker marks token as rugged");
  return {
    status: bundledSupplyPct != null && sniperSupplyPct != null && insiderSupplyPct != null ? "ok" : "incomplete",
    checkedAt: Math.min(...pools.map((p: any) => Number(p.lastUpdated))),
    bundledSupplyPct, sniperSupplyPct, insiderSupplyPct,
    initialBundledSupplyPct: percentage(bundles?.initialPercentage),
    mintAuthorityRevoked: authority("mintAuthority"), freezeAuthorityRevoked: authority("freezeAuthority"),
    riskScore: numberValue(risk.score), rugged: risk.rugged, flags,
  };
}

export async function getSolanaTrackerEvidence(mint: string): Promise<TrackerEvidence> {
  const key = process.env.SOLANA_TRACKER_API_KEY;
  if (!key) return { status: "not-configured", flags: [] };
  try {
    const path = `/tokens/${encodeURIComponent(mint)}`;
    const token = await request(path, key);
    // Sequential calls keep each analysis below a burst of multiple concurrent requests.
    // Quota/rate-limit errors remain unavailable; no paid upgrade or fallback to CLEAN.
    let bundles: any;
    let bundleError: string | undefined;
    try { bundles = await request(`${path}/bundlers`, key); }
    catch (error) { bundleError = error instanceof Error ? error.message : "Bundle request unavailable"; }
    const result = parseTrackerEvidence(mint, token, bundles, Date.now());
    return { ...result, error: result.error || bundleError };
  } catch (error) {
    return { status: "unavailable", error: error instanceof Error ? error.message : "Request unavailable", flags: [] };
  }
}
