import { describe, expect, it, vi } from "vitest";
import { emptyMonitorState } from "../lib/pair-events";
import { ensureFttWatch, fttLaunchEvent, pairCohortWindowOpen, readFttReadiness, shouldNotifyFtt, validFttPricing, formatFttReady, FTT_MINT, FTT_EMPTY_BASELINE, type FttWatch } from "../lib/ftt-watch";

const valid = () => ({ quote: { mint: FTT_MINT, decimals: 8 }, raise: { raw: "100" },
  curve: { programId: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj", configId: FTT_MINT,
    curveType: "ConstantCurve", migrateType: "cpmm", supply: "1000", totalSellA: "800" },
  platform: { standard: FTT_MINT }, curveRule: { standard: FTT_MINT } });
const seed = (): FttWatch => ({ since: FTT_EMPTY_BASELINE, status: "waiting" });
function fake(options: { http?: number; pricing?: any; pair?: any; enabled?: boolean; registryHttp?: number; stats?: any } = {}) {
  return vi.fn(async (input: any) => {
    const url = String(input);
    if (url.endsWith("/pairs")) return { status: options.registryHttp ?? 200,
      json: async () => ({ data: { pairs: [options.pair ?? { mint: FTT_MINT, launchable: true, launchLabReady: true }] } }) };
    if (url.endsWith("/stats")) return { status: 200,
      json: async () => ({ data: options.stats ?? { config: { launchLabEnabled: options.enabled ?? true } } }) };
    return { status: options.http ?? 200, json: async () => ({ data: options.pricing ?? valid() }) };
  }) as unknown as typeof fetch;
}
describe("FTT readiness alert", () => {
  it("does not treat the two registry flags plus HTTP503 as activation", async () => {
    const s = await readFttReadiness(seed(), fake({ http: 503 }), 123);
    expect(s.status).toBe("pricing-unavailable"); expect(s.pricingHttpStatus).toBe(503); expect(shouldNotifyFtt(s)).toBe(false);
  });
  it("detects the recovery from 503 to valid pricing", async () => {
    const failed = await readFttReadiness(seed(), fake({ http: 503 }), 123);
    const s = await readFttReadiness(failed, fake(), 124);
    expect(s.status).toBe("ready"); expect(s.readyDetectedAt).toBe(124); expect(shouldNotifyFtt(s)).toBe(true);
  });
  it("alerts when already ready on the first deployment check without inventing an activation timestamp", async () => {
    const s = await readFttReadiness(seed(), fake(), 124);
    expect(s.readyDetectedAt).toBe(124); expect(shouldNotifyFtt(s)).toBe(true);
  });
  it.each([undefined, false, "true"])("requires the readiness boolean, not missing/false/string values: %s", async flag => {
    const s = await readFttReadiness(seed(), fake({ pair: { mint: FTT_MINT, launchable: true, launchLabReady: flag } }), 123);
    expect(shouldNotifyFtt(s)).toBe(false);
  });
  it("requires the platform LaunchLab switch", async () => {
    expect(shouldNotifyFtt(await readFttReadiness(seed(), fake({ enabled: false })))).toBe(false);
  });
  it("never activates against MSFTX, an arbitrary FTX-named token or a wrong pricing mint", async () => {
    const p = valid(); p.quote.mint = "So11111111111111111111111111111111111111112";
    expect(validFttPricing(p)).toBe(false);
    expect(shouldNotifyFtt(await readFttReadiness(seed(), fake({ pair: { mint: "MSFTX", name: "FTX", launchable: true, launchLabReady: true } })))).toBe(false);
  });
  it("rejects empty/malformed pricing, zero raise and missing launch config", () => {
    expect(validFttPricing({})).toBe(false);
    const p = valid(); p.raise.raw = "0"; expect(validFttPricing(p)).toBe(false);
    p.raise.raw = "1"; p.curve.configId = ""; expect(validFttPricing(p)).toBe(false);
  });
  it("does not call a registry HTTP failure an activation", async () => {
    expect((await readFttReadiness(seed(), fake({ registryHttp: 503 }))).status).toBe("source-error");
  });
  it("retains the pending alert until delivery and avoids repeat notifications after restart", async () => {
    const s = await readFttReadiness(seed(), fake(), 124);
    const retry = await readFttReadiness(s, fake(), 125);
    expect(retry.readyDetectedAt).toBe(124); expect(shouldNotifyFtt(retry)).toBe(true);
    const sent = { ...retry, notifiedAt: 126 };
    const never = vi.fn() as unknown as typeof fetch;
    expect(shouldNotifyFtt(await readFttReadiness(sent, never, 127))).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
  it("does not send a stale pending READY message while pricing is failing again", async () => {
    const ready = await readFttReadiness(seed(), fake(), 124);
    expect(shouldNotifyFtt(await readFttReadiness(ready, fake({ http: 503 }), 125))).toBe(false);
  });
  it("handles network failures without stopping the existing monitor", async () => {
    const fail = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
    const s = await readFttReadiness(seed(), fail, 123);
    expect(s.status).toBe("source-error"); expect(shouldNotifyFtt(s)).toBe(false);
  });
  it("labels API readiness separately from a completed token launch", async () => {
    const text = formatFttReady(await readFttReadiness(seed(), fake(), 124));
    expect(text).toContain("FTT PARING KLAR"); expect(text).toContain("FTT LAUNCH #1");
    expect(text).toContain("ikke en gjennomført launchtransaksjon"); expect(text).toContain(FTT_MINT);
  });
});
describe("FTT persistent first-launch watch", () => {
  it("survives both the two-hour cohort timeout and 48-hour event expiry", () => {
    const state = ensureFttWatch(emptyMonitorState());
    const event = fttLaunchEvent(state)!;
    expect(event.quoteMint).toBe(FTT_MINT);
    expect(pairCohortWindowOpen(event, state.pairLaunchWatches![FTT_MINT], FTT_EMPTY_BASELINE + 7 * 86400_000, true)).toBe(true);
  });
  it("does not extend every other quote or seed independent monitors", () => {
    expect(fttLaunchEvent(emptyMonitorState())).toBeUndefined();
    const state = ensureFttWatch(emptyMonitorState());
    const event = { ...fttLaunchEvent(state)!, quoteMint: "other" };
    expect(pairCohortWindowOpen(event, state.pairLaunchWatches![FTT_MINT], FTT_EMPTY_BASELINE + 3 * 3600_000, true)).toBe(false);
  });
  it("preserves the existing #1/#2/#3 delivery ledger rather than creating duplicates", () => {
    const s = ensureFttWatch(emptyMonitorState());
    const w = s.pairLaunchWatches![FTT_MINT];
    w.ranked = [1,2,3].map(n => ({ mint: String(n), launchedAt: FTT_EMPTY_BASELINE + n }));
    w.notifiedMints = { "1": 1, "2": 2 };
    expect(fttLaunchEvent(ensureFttWatch(s))).toBeDefined();
    w.notifiedMints["3"] = 3;
    expect(fttLaunchEvent(ensureFttWatch(s))).toBeUndefined();
    expect(ensureFttWatch(s).pairLaunchWatches![FTT_MINT]).toBe(w);
  });
});
