import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGmgnEvidence, type GmgnReport } from "@/lib/gmgn";

const mint = "A".repeat(32);
const now = 1_800_000_000_000;
const launchedAt = now - 60_000;
const addr = (letter: string) => letter.repeat(32);
const holder = (letter: string, share: number, tags: string[] = [], funder = "K") => ({
  address: addr(letter), account_address: addr(letter) + "1", amount_percentage: String(share),
  balance: share * 1_000, maker_token_tags: tags, created_at: now / 1_000 - 7 * 86400,
  native_transfer: { from_address: addr(funder), amount: "1.2", timestamp: now / 1_000 - 6 * 86400 },
});
const report = (): GmgnReport => ({ status: "ok", checkedAt: now,
  info: { address: mint, holder_count: 2, stat: { holder_count: 2 } },
  security: { address: mint, renounced_mint: true, renounced_freeze_account: true },
  holders: [holder("B", 0.5), holder("C", 0.5, [], "L")],
});
const parse = (r = report(), exclusions: string[] = []) => parseGmgnEvidence(mint, launchedAt, r, exclusions, now);

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("GMGN supply evidence", () => {
  it("requires complete wallet coverage and original funding/age observations for a clean measurement", () => {
    expect(parse()).toMatchObject({ status: "ok", coverageComplete: true, sampledWallets: 2,
      bundledSupplyPct: 0, sniperSupplyPct: 0, insiderSupplyPct: 0, commonFunderSupplyPct: 0, freshWalletSupplyPct: 0 });
  });
  it("uses current tagged holdings, not bundle trading volume or fresh-wallet counts", () => {
    const r = report();
    r.info.stat = { holder_count: 3, top_bundler_trader_percentage: "0.91", fresh_wallet_rate: "0.87" };
    r.info.holder_count = 3;
    r.security.bundler_trader_amount_rate = "0.99";
    r.holders = [holder("B", .01, ["bundler", "rat_trader"]), holder("C", .02, ["sniper"], "L"), holder("D", .97, [], "M")];
    r.holders[1].created_at = now / 1000 - 3600;
    expect(parse(r)).toMatchObject({ bundledSupplyPct: 1, sniperSupplyPct: 2, insiderSupplyPct: 1, freshWalletSupplyPct: 2 });
    r.holders = undefined;
    expect(parse(r).bundledSupplyPct).toBeUndefined();
    expect(parse(r).freshWalletSupplyPct).toBeUndefined();
  });
  it("never treats a capped low-risk sample as a full clean report", () => {
    const r = report(); r.info.holder_count = 201;
    const result = parse(r);
    expect(result).toMatchObject({ status: "incomplete", coverageComplete: false });
    for (const field of ["bundledSupplyPct", "sniperSupplyPct", "commonFunderSupplyPct", "freshWalletSupplyPct"] as const) {
      expect(result[field]).toBeUndefined();
    }
    r.holders![0].maker_token_tags = ["bundler"];
    expect(parse(r).flags.join(" ")).toContain("bundledSupplyPct at least 50.00%");
  });
  it("uses the larger holder counter and does not count pool vaults as verified wallets", () => {
    const r = report(); r.info.stat.holder_count = 3;
    expect(parse(r).coverageComplete).toBe(false);
    const complete = report(); complete.holders![0].maker_token_tags = ["bundler"];
    const result = parse(complete, [complete.holders![0].account_address]);
    expect(result).toMatchObject({ sampledWallets: 1, coverageComplete: false, observed: { bundledSupplyPct: 0 } });
    expect(result).toMatchObject({ sampleValid: true, sampledSupplyPct: 50, largestObservedHolderPct: 50, top10ObservedPct: 50 });
  });
  it("keeps missing funding, wallet timestamps and classifications unknown", () => {
    for (const mutation of [
      (r: GmgnReport) => { delete r.holders![0].native_transfer; },
      (r: GmgnReport) => { r.holders![0].native_transfer.timestamp = -1; },
      (r: GmgnReport) => { r.holders![0].native_transfer.timestamp = now / 1000 + 300; },
    ]) {
      const r = report(); mutation(r);
      expect(parse(r).commonFunderSupplyPct).toBeUndefined();
    }
    for (const createdAt of [0, -1, null, now / 1000 + 300]) {
      const r = report(); r.holders![0].created_at = createdAt;
      expect(parse(r).freshWalletSupplyPct).toBeUndefined();
    }
    const r = report(); delete r.holders![0].maker_token_tags;
    expect(parse(r).bundledSupplyPct).toBeUndefined();
  });
  it("groups the live from_address field and accepts the documented legacy address field", () => {
    const r = report(); r.holders![1].native_transfer.from_address = addr("K");
    expect(parse(r).commonFunderSupplyPct).toBe(100);
    r.holders![1].native_transfer.address = addr("K"); delete r.holders![1].native_transfer.from_address;
    expect(parse(r).commonFunderSupplyPct).toBe(100);
  });
  it("rejects stale/wrong-token evidence, duplicate holders and inconsistent totals", () => {
    for (const mutation of [
      (r: GmgnReport) => { r.checkedAt = now - 600_000; },
      (r: GmgnReport) => { r.info.address = addr("Z"); },
      (r: GmgnReport) => { r.holders![1].address = r.holders![0].address; },
      (r: GmgnReport) => { r.holders![0].amount_percentage = "0.9"; },
      (r: GmgnReport) => { r.holders![0].balance = -1; },
    ]) { const r = report(); mutation(r); expect(parse(r).bundledSupplyPct).toBeUndefined(); expect(parse(r).sampleValid).not.toBe(true); }
  });
  it("requires explicit authority booleans and preserves aggregate insider risk", () => {
    const r = report(); r.security.renounced_mint = "true";
    r.security.suspected_insider_hold_rate = "0.12";
    expect(parse(r)).toMatchObject({ mintAuthorityRevoked: undefined, insiderSupplyPct: 12 });
    r.security.address = addr("Z");
    expect(parse(r).freezeAuthorityRevoked).toBeUndefined();
  });
});

describe("GMGN read-only requests and wallet gate", () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubEnv("GMGN_API_KEY", "test-read-only-key");
    vi.stubEnv("SOLANA_TRACKER_API_KEY", ""); vi.stubEnv("WALLET_RISK_API_URL", "");
  });
  const mockAPI = (r: GmgnReport) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const data = url.includes("/token/info") ? r.info : url.includes("/token/security") ? r.security
      : url.includes("rugcheck") ? {} : { list: r.holders };
    return Response.json(url.includes("rugcheck") ? data : { code: 0, data });
  }));
  it("can complete the real wallet gate and preserves conflicting active authorities", async () => {
    const r = report(); mockAPI(r);
    const { getWalletRiskMetrics } = await import("@/lib/wallet-risk");
    const pending = getWalletRiskMetrics(mint, launchedAt);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ verification: "CLEAN", provider: "GMGN", fundingChecked: true });
    r.security.renounced_mint = false;
    const conflict = getWalletRiskMetrics(mint, launchedAt);
    await vi.runAllTimersAsync();
    expect(await conflict).toMatchObject({ verification: "RISKY", mintAuthorityRevoked: false });
  });
  it("keeps the wallet gate UNKNOWN when a required original funding transfer is missing", async () => {
    const r = report(); delete r.holders![0].native_transfer; mockAPI(r);
    const { getWalletRiskMetrics } = await import("@/lib/wallet-risk");
    const pending = getWalletRiskMetrics(mint, launchedAt); await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ verification: "UNKNOWN", fundingChecked: false, commonFunderSupplyPct: undefined });
  });
  it("uses read routes/header and keeps the live API's 100-holder cap explicit", async () => {
    const r = report(); r.info.holder_count = 101; r.info.stat.holder_count = 101;
    const rows = Array.from({ length: 101 }, (_, i) => ({ ...holder("B", 1 / 101), address: `${"A".repeat(30)}${"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(i/58)]}${"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[i%58]}` }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ code: 0, data:
      url.includes("/token/info") ? r.info : url.includes("/token/security") ? r.security
      : { list: rows.slice(0, 100) } })));
    const { getGmgnReport } = await import("@/lib/gmgn");
    const pending = getGmgnReport(mint); await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.holders).toHaveLength(100);
    expect(parse(response).coverageComplete).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url, options] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/openapi\.gmgn\.ai\/v1\/(token\/(info|security)|market\/token_top_holders)\?/);
      expect(options?.headers).toMatchObject({ "X-APIKEY": "test-read-only-key" });
      expect(options?.method).toBeUndefined();
      expect(String(url)).not.toContain("direction=asc");
    }
  });
  it("stops on quota errors without a retry storm or fabricated zero values", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const { getGmgnReport } = await import("@/lib/gmgn");
    expect(await getGmgnReport(mint)).toMatchObject({ status: "unavailable", error: "GMGN HTTP 429" });
    expect((await getGmgnReport(mint)).status).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not call the API without credentials and rejects mismatched token identity", async () => {
    const r = report(); r.info.address = addr("Z"); mockAPI(r);
    const { getGmgnReport } = await import("@/lib/gmgn");
    vi.stubEnv("GMGN_API_KEY", ""); expect((await getGmgnReport(mint)).status).toBe("not-configured");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("GMGN_API_KEY", "test");
    expect(await getGmgnReport(mint)).toMatchObject({ error: "GMGN token identity mismatch" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
