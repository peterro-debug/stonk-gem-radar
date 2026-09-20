import { randomUUID } from "node:crypto";
import { WALLET_LIMITS } from "./constants";
import { count, isFresh, numberValue } from "./risk-validation";

type SupplyField = "bundledSupplyPct" | "sniperSupplyPct" | "insiderSupplyPct" | "commonFunderSupplyPct" | "freshWalletSupplyPct";
export type GmgnReport = { status: "not-configured" | "unavailable" | "incomplete" | "ok";
  checkedAt?: number; info?: any; security?: any; holders?: any[]; error?: string };
export type GmgnEvidence = {
  status: GmgnReport["status"]; checkedAt?: number; error?: string; missing: string[]; flags: string[];
  sampledWallets: number; expectedWallets?: number; coverageComplete: boolean;
  sampleValid?: boolean; sampledSupplyPct?: number; largestObservedHolderPct?: number; top10ObservedPct?: number;
  observed: Partial<Record<SupplyField, number>>;
  bundledSupplyPct?: number; sniperSupplyPct?: number; insiderSupplyPct?: number;
  commonFunderSupplyPct?: number; freshWalletSupplyPct?: number;
  mintAuthorityRevoked?: boolean; freezeAuthorityRevoked?: boolean;
};

const address = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const ratio = (v: unknown) => { const n = numberValue(v); return n != null && n >= 0 && n <= 1 ? n : undefined; };
const explicitBoolean = (v: unknown) => typeof v === "boolean" ? v : undefined;

// Read-only documented OpenAPI routes. No signing key or trading route is used.
// Spacing/cooldown is per instance; a server-side quota response stops this whole
// analysis without retrying. Cross-instance 429s remain unavailable, never CLEAN.
let nextRequestAt = 0;
let cooldownUntil = 0;
async function request(route: string, mint: string, key: string, deadline: number, extra: Record<string, string> = {}) {
  const now = Date.now();
  if (cooldownUntil > now) throw new Error("GMGN quota cooldown; awaiting next scheduled check");
  const reservedAt = Math.max(now, nextRequestAt);
  if (reservedAt - now > 4_000 || deadline - reservedAt < 1_000) throw new Error("GMGN request budget exhausted");
  nextRequestAt = reservedAt + 1_100;
  if (reservedAt > now) await new Promise(resolve => setTimeout(resolve, reservedAt - now));
  const query = new URLSearchParams({ chain: "sol", address: mint, ...extra,
    timestamp: String(Math.floor(Date.now() / 1_000)), client_id: randomUUID() });
  const response = await fetch(`https://openapi.gmgn.ai${route}?${query}`, {
    headers: { "X-APIKEY": key, accept: "application/json", "user-agent": "StonkGemRadar/1.0" },
    cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now()))),
  });
  if (response.status === 429) {
    const reset = Number(response.headers.get("X-RateLimit-Reset")) * 1_000;
    cooldownUntil = Number.isFinite(reset) && reset > Date.now() ? reset : Date.now() + 5 * 60_000;
  }
  if (!response.ok) throw new Error(`GMGN HTTP ${response.status}`);
  const body = await response.json();
  if (body?.code !== 0 || !body.data || typeof body.data !== "object") throw new Error("GMGN unsuccessful or malformed response");
  return body.data;
}

export async function getGmgnReport(mint: string): Promise<GmgnReport> {
  const key = process.env.GMGN_API_KEY;
  if (!key) return { status: "not-configured" };
  if (!address(mint)) return { status: "unavailable", error: "Invalid Solana mint" };
  const report: GmgnReport = { status: "incomplete" };
  const deadline = Date.now() + 38_000;
  try {
    report.info = await request("/v1/token/info", mint, key, deadline);
    report.checkedAt = Date.now();
    if (report.info.address !== mint) throw new Error("GMGN token identity mismatch");
    report.security = await request("/v1/token/security", mint, key, deadline);
    if (report.security.address !== mint) throw new Error("GMGN security identity mismatch");
    const params = { limit: "100", order_by: "amount_percentage", direction: "desc" };
    const holders = await request("/v1/market/token_top_holders", mint, key, deadline, params);
    if (!Array.isArray(holders.list)) throw new Error("GMGN holder list missing");
    report.holders = holders.list;
    // The live API rejects ASC (40000301: direction only support [DESC]),
    // despite the docs advertising it. No pagination is documented. Never
    // represent this capped list as a full scan when holder_count is larger.
    report.status = "ok";
  } catch (error) {
    report.status = report.info ? "incomplete" : "unavailable";
    // Only locally generated errors are exposed; upstream messages can contain
    // arbitrary metadata or sensitive request echoes.
    report.error = error instanceof Error && error.message.startsWith("GMGN") ? error.message : "GMGN request unavailable";
  }
  return report;
}

export function parseGmgnEvidence(mint: string, launchedAt: number, report: GmgnReport,
  excludedTokenAccounts: string[] = [], now = Date.now()): GmgnEvidence {
  const result: GmgnEvidence = { status: report.status, error: report.error, missing: [], flags: [],
    sampledWallets: 0, coverageComplete: false, observed: {} };
  const info = report.info;
  if (info?.address !== mint || !isFresh(report.checkedAt, now)) {
    result.missing.push("fresh, mint-matched GMGN report"); return result;
  }
  result.checkedAt = report.checkedAt;
  const security = report.security?.address === mint ? report.security : undefined;
  result.mintAuthorityRevoked = explicitBoolean(security?.renounced_mint);
  result.freezeAuthorityRevoked = explicitBoolean(security?.renounced_freeze_account);
  if (result.mintAuthorityRevoked == null) result.missing.push("mint authority status");
  if (result.freezeAuthorityRevoked == null) result.missing.push("freeze authority status");
  if (security?.is_wash_trading === true) result.flags.push("GMGN reports wash trading");
  const expected = count(info.holder_count);
  result.expectedWallets = expected == null ? undefined : Math.max(expected, count(info.stat?.holder_count) ?? 0);
  const rows = Array.isArray(report.holders) ? report.holders : [];
  const excluded = new Set(excludedTokenAccounts);
  const seen = new Set<string>();
  let validRows = true, tagComplete = true, fundingComplete = true, ageComplete = true;
  let sum = 0, bundles = 0, snipers = 0, insiders = 0, fresh = 0;
  const funding = new Map<string, { count: number; share: number }>();
  const holderShares: number[] = [];
  for (const row of rows) {
    const share = ratio(row?.amount_percentage);
    const balance = numberValue(row?.balance);
    if (!address(row?.address) || seen.has(row.address) || share == null || balance == null || balance <= 0 || share <= 0) {
      validRows = false; continue;
    }
    seen.add(row.address); sum += share;
    // Only use explicit pool accounts from our on-chain/RugCheck context.
    // GMGN's generic address type alone does not establish a pool exclusion.
    if (excluded.has(row.account_address)) continue;
    result.sampledWallets++;
    holderShares.push(share);
    if (!Array.isArray(row.maker_token_tags) || !row.maker_token_tags.every((t: any) => typeof t === "string")) tagComplete = false;
    const tags: string[] = Array.isArray(row.maker_token_tags) ? row.maker_token_tags : [];
    if (tags.includes("bundler")) bundles += share;
    if (tags.includes("sniper")) snipers += share;
    if (tags.includes("rat_trader")) insiders += share;
    const created = numberValue(row.created_at);
    if (created == null || created <= 0 || created * 1_000 > now + 30_000 || !Number.isFinite(launchedAt) || launchedAt <= 0 || launchedAt > now + 30_000) ageComplete = false;
    else if (created * 1_000 >= launchedAt - 24 * 60 * 60_000) fresh += share;
    const f = row.native_transfer;
    // The live API uses from_address; older docs used address. Never infer
    // a common funder from the creator or from an insider/volume percentage.
    const source = f?.from_address ?? f?.address;
    const fundedAt = numberValue(f?.timestamp);
    if (!address(source) || source === row.address || fundedAt == null || fundedAt <= 0 || fundedAt * 1_000 > now + 30_000 || (numberValue(f?.amount) ?? 0) <= 0) fundingComplete = false;
    else { const cluster = funding.get(source) ?? { count: 0, share: 0 }; cluster.count++; cluster.share += share; funding.set(source, cluster); }
  }
  // A missing/capped list or inconsistent totals cannot establish zero risk.
  result.coverageComplete = validRows && sum <= 1.000001 && result.expectedWallets != null
    && result.expectedWallets > 0 && result.sampledWallets >= result.expectedWallets;
  if (!result.coverageComplete) result.missing.push(`holder coverage ${result.sampledWallets}/${result.expectedWallets ?? "unknown"}`);
  if (!tagComplete) result.missing.push("wallet classification tags");
  if (!fundingComplete) result.missing.push("funding origins");
  if (!ageComplete) result.missing.push("wallet creation timestamps");
  const common = Math.max(0, ...[...funding.values()].filter(c => c.count >= 2).map(c => c.share));
  if (validRows && rows.length && sum <= 1.000001) {
    result.sampleValid = true;
    result.sampledSupplyPct = holderShares.reduce((total, share) => total + share, 0) * 100;
    holderShares.sort((a, b) => b - a);
    result.largestObservedHolderPct = (holderShares[0] ?? 0) * 100;
    result.top10ObservedPct = holderShares.slice(0, 10).reduce((total, share) => total + share, 0) * 100;
    result.observed = { bundledSupplyPct: bundles * 100, sniperSupplyPct: snipers * 100,
      insiderSupplyPct: insiders * 100, commonFunderSupplyPct: common * 100, freshWalletSupplyPct: fresh * 100 };
    for (const [field, pct] of Object.entries(result.observed)) {
      if (pct > WALLET_LIMITS[field as SupplyField]) result.flags.push(`GMGN observed ${field} at least ${pct.toFixed(2)}% exceeds ${WALLET_LIMITS[field as SupplyField]}%`);
    }
  }
  if (result.coverageComplete && tagComplete) {
    result.bundledSupplyPct = bundles * 100; result.sniperSupplyPct = snipers * 100;
    result.insiderSupplyPct = insiders * 100;
  }
  if (result.coverageComplete && fundingComplete) result.commonFunderSupplyPct = common * 100;
  if (result.coverageComplete && ageComplete) result.freshWalletSupplyPct = fresh * 100;
  const insiderAggregate = ratio(security?.suspected_insider_hold_rate);
  if (insiderAggregate != null) result.insiderSupplyPct = Math.max(result.insiderSupplyPct ?? 0, insiderAggregate * 100);
  result.status = result.missing.length || !security ? "incomplete" : "ok";
  return result;
}
