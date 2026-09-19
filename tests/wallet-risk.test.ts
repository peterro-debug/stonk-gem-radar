import { afterEach, describe, expect, it, vi } from "vitest";
import { getWalletRiskMetrics } from "@/lib/wallet-risk";
import { getSolanaTrackerEvidence, parseTrackerEvidence } from "@/lib/solana-tracker";
import { authorityRevoked } from "@/lib/risk-validation";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const group = { count: 0, totalPercentage: 0, wallets: [] };
const token = (now = Date.now()) => ({ token: { mint: "mint" }, pools: [{ tokenAddress: "mint", lastUpdated: now,
  security: { mintAuthority: null, freezeAuthority: null } }], risk: { rugged: false, risks: [], snipers: group, insiders: group } });
const bundles = { total: 0, percentage: 0, initialPercentage: 0, wallets: [] };
const rug = { mint: "mint", graphInsidersDetected: 0, token: { supply: 1000, mintAuthority: null, freezeAuthority: null }, insiderNetworks: [], risks: [] };
const specialist = () => ({ mint: "mint", checkedAt: Date.now(), bundleChecked: true, sniperChecked: true, fundingChecked: true,
  bundledSupplyPct: 0, sniperSupplyPct: 0, commonFunderSupplyPct: 0, freshWalletSupplyPct: 0 });

describe("Solana Tracker and evidence validation", () => {
  it("uses the documented dedicated bundle response and distinguishes zero from missing", () => {
    const now = Date.now();
    expect(parseTrackerEvidence("mint", token(now), bundles, now)).toMatchObject({ status: "ok", bundledSupplyPct: 0, sniperSupplyPct: 0 });
    expect(parseTrackerEvidence("mint", token(now), undefined, now)).toMatchObject({ status: "incomplete", bundledSupplyPct: undefined });
    expect(parseTrackerEvidence("other", token(now), bundles, now).status).toBe("incomplete");
    expect(parseTrackerEvidence("mint", token(now - 600_000), bundles, now).status).toBe("incomplete");
  });
  it("does not turn missing, malformed or conflicting authority values into revocation", () => {
    expect(authorityRevoked({}, "mintAuthority")).toBeUndefined();
    expect(authorityRevoked({ mintAuthority: "" }, "mintAuthority")).toBeUndefined();
    expect(authorityRevoked({ mintAuthority: null }, "mintAuthority")).toBe(true);
  });
  it("handles missing credentials and quota errors without passing a candidate", async () => {
    vi.stubEnv("SOLANA_TRACKER_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    expect((await getSolanaTrackerEvidence("mint")).status).toBe("not-configured");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("SOLANA_TRACKER_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429 })));
    expect(await getSolanaTrackerEvidence("mint")).toMatchObject({ status: "unavailable", error: "Solana Tracker HTTP 429" });
  });
  it("keeps funding UNKNOWN even when Tracker's bundle/sniper/insider reports are clean", async () => {
    vi.stubEnv("SOLANA_TRACKER_API_KEY", "test"); vi.stubEnv("WALLET_RISK_API_URL", "");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => Response.json(
      url.includes("rugcheck") ? rug : url.endsWith("/bundlers") ? bundles : token())));
    const result = await getWalletRiskMetrics("mint", Date.now());
    expect(result).toMatchObject({ verification: "UNKNOWN", bundleChecked: true, sniperChecked: true, fundingChecked: false });
    expect(result.flags.join(" ")).toContain("common funders");
  });
  it("requires fresh mint-matched measurements from the specialist and never trusts booleans alone", async () => {
    vi.stubEnv("SOLANA_TRACKER_API_KEY", ""); vi.stubEnv("WALLET_RISK_API_URL", "https://specialist.example/test");
    let report: any = specialist();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => Response.json(url.includes("rugcheck") ? rug : report)));
    expect((await getWalletRiskMetrics("mint", 1)).verification).toBe("CLEAN");
    for (const bad of [{ ...specialist(), checkedAt: Date.now() - 600_000 }, { ...specialist(), mint: "other" },
      { ...specialist(), commonFunderSupplyPct: null }, { ...specialist(), bundledSupplyPct: -1 },
      { ...specialist(), freshWalletSupplyPct: 101 }]) {
      report = bad;
      expect((await getWalletRiskMetrics("mint", 1)).verification).toBe("UNKNOWN");
    }
  });
});
