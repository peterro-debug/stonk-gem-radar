import type { PairLaunchWatch, PairMonitorState } from "./pair-events";
import type { PairEvent } from "./types";

export const FTT_MINT = "EzfgjvkSwthhgHaceR3LnKXUoRkP6NUhfghdaHAj1tUv";
// Last independently captured successful empty Stonk quote-feed snapshot.
// This is an observation baseline, NOT the quote's creation/activation time.
export const FTT_EMPTY_BASELINE = Date.parse("2026-09-20T20:29:44.609Z");
const BASE = "https://www.stonkfun.xyz/api/public/v1";
export type FttWatch = {
  since: number;
  status: "waiting" | "registry-not-ready" | "pricing-unavailable" | "source-error" | "ready";
  checkedAt?: number;
  pricingHttpStatus?: number;
  launchable?: boolean;
  launchLabReady?: boolean;
  configId?: string;
  error?: string;
  readyDetectedAt?: number;
  notifiedAt?: number;
  deliveryError?: string;
};
export function ensureFttWatch(state: PairMonitorState): PairMonitorState {
  const fttWatch = state.fttWatch ?? { since: FTT_EMPTY_BASELINE, status: "waiting" as const };
  const old = state.pairLaunchWatches?.[FTT_MINT];
  return { ...state, fttWatch, pairLaunchWatches: { ...state.pairLaunchWatches,
    [FTT_MINT]: old ?? { eventDetectedAt: fttWatch.since, ranked: [], notifiedMints: {}, cohort: [], momentumNotified: {} },
  } };
}
export function fttLaunchEvent(state: PairMonitorState): PairEvent | undefined {
  const watch = state.pairLaunchWatches?.[FTT_MINT];
  if (!state.fttWatch || !watch || watch.ranked.slice(0, 3).filter(r => watch.notifiedMints[r.mint]).length >= 3) return undefined;
  return { quoteMint: FTT_MINT, detectedAt: watch.eventDetectedAt, source: "stonk-registry",
    sourceUrl: `${BASE}/pairs`,
    description: "User-requested persistent FTT watch from a verified empty-feed observation; not a new registry/activation timestamp." };
}
export function pairCohortWindowOpen(event: PairEvent, watch: PairLaunchWatch | undefined, now: number, pinnedFtt: boolean): boolean {
  return Boolean(watch && (now - event.detectedAt <= 2 * 60 * 60_000
    || (pinnedFtt && event.quoteMint === FTT_MINT && watch.ranked.length < 3)));
}
const address = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const positiveRaw = (v: unknown) => typeof v === "string" && /^\d+$/.test(v) && BigInt(v) > 0n;
export function validFttPricing(p: any): boolean {
  return p?.quote?.mint === FTT_MINT && p.quote.decimals === 8
    && p?.curve?.programId === "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
    && address(p.curve.configId) && p.curve.curveType === "ConstantCurve" && p.curve.migrateType === "cpmm"
    && positiveRaw(p?.raise?.raw) && positiveRaw(p.curve.supply) && positiveRaw(p.curve.totalSellA)
    && address(p?.platform?.standard) && address(p?.curveRule?.standard);
}
export function shouldNotifyFtt(watch: FttWatch): boolean {
  return watch.status === "ready" && watch.readyDetectedAt != null && watch.notifiedAt == null;
}
export async function readFttReadiness(previous: FttWatch, fetcher: typeof fetch = fetch, now = Date.now()): Promise<FttWatch> {
  // One readiness notification, persisted across restarts. Child launches
  // keep using the existing shared pair-launch watcher and delivery ledger.
  if (previous.notifiedAt != null) return previous;
  const state: FttWatch = { ...previous, checkedAt: now, error: undefined, pricingHttpStatus: undefined,
    launchable: undefined, launchLabReady: undefined, configId: undefined };
  const base = (process.env.STONKFUN_API_BASE || BASE).replace(/\/$/, "");
  async function get(path: string) {
    const r = await fetcher(base + path, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const b = await r.json();
    return { http: r.status, data: b?.data ?? b };
  }
  try {
    const [registry, stats, pricing] = await Promise.all([
      get("/pairs"), get("/stats"), get(`/launchlab/pricing?quoteMint=${FTT_MINT}`),
    ]);
    state.pricingHttpStatus = pricing.http;
    if (registry.http !== 200 || stats.http !== 200 || !Array.isArray(registry.data?.pairs)
      || typeof stats.data?.config?.launchLabEnabled !== "boolean") {
      return { ...state, status: "source-error", error: "Registry/platform status could not be verified" };
    }
    const pair = registry.data.pairs.find((p: any) => p.mint === FTT_MINT);
    state.launchable = pair?.launchable;
    state.launchLabReady = pair?.launchLabReady;
    if (pair?.launchable !== true || pair?.launchLabReady !== true || stats.data.config.launchLabEnabled !== true) {
      return { ...state, status: "registry-not-ready" };
    }
    if (pricing.http !== 200 || !validFttPricing(pricing.data)) {
      return { ...state, status: "pricing-unavailable", error: `FTT pricing HTTP ${pricing.http}; valid launch configuration not confirmed` };
    }
    return { ...state, status: "ready", configId: pricing.data.curve.configId,
      readyDetectedAt: previous.readyDetectedAt ?? now };
  } catch {
    return { ...state, status: "source-error", error: "FTT source timed out or returned malformed data; will retry" };
  }
}
export function formatFttReady(watch: FttWatch): string {
  return [
    "🟢 STONK — FTT PARING KLAR / PRISING AKTIV",
    "FTX Token (FTT)",
    "Stonk rapporterer launchable=true og launchLabReady=true. FTT-prising og launchkonfigurasjon svarer gyldig.",
    `Quote mint: ${FTT_MINT}`,
    `Først bekreftet av denne vakten: ${new Date(watch.readyDetectedAt!).toISOString()}`,
    "Første faktiske tokenlaunch varsles separat som FTT LAUNCH #1. Vakten utløper ikke etter to timer.",
    "Dette bekrefter API-klarstatus, ikke en gjennomført launchtransaksjon eller et kjøpssignal.",
    `${BASE}/tokens?quoteMint=${FTT_MINT}&sort=newest&page=1&pageSize=100`,
  ].join("\n");
}
