import { afterEach, describe, expect, it, vi } from "vitest";
import { getPairMetrics } from "@/lib/dex";

afterEach(() => vi.unstubAllGlobals());
const reversed = {
  chainId: "solana", pairAddress: "pepe-pool", baseToken: { address: "PEPE" }, quoteToken: { address: "FEELSGOOD" },
  priceUsd: "0.00063", marketCap: 630_000, fdv: 630_000, liquidity: { usd: 350_000 },
  txns: { m5: { buys: 10, sells: 35 }, h1: { buys: 100, sells: 250 } },
  volume: { m5: 25_000 }, priceChange: { m5: -10, h24: -25 },
};
const base = {
  chainId: "solana", pairAddress: "sol-pool", baseToken: { address: "FEELSGOOD" }, quoteToken: { address: "SOL" },
  priceUsd: "0.0119", marketCap: 11_900_000, fdv: 11_900_000, liquidity: { usd: 460_000 },
  txns: { m5: { buys: 999, sells: 900 } }, priceChange: { m5: 8, h24: 140 },
};
function feed(pairs: unknown[]) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ pairs }))); }

describe("target token valuation and pair flow", () => {
  it("values FEELSGOOD from its own base pool while reversing the PEPE pair's flow", async () => {
    feed([reversed, base]);
    const result = await getPairMetrics("FEELSGOOD", "PEPE");
    expect(result).toMatchObject({ marketCap: 11_900_000, priceUsd: .0119, liquidityUsd: 350_000,
      buys5m: 35, sells5m: 10, priceChange24h: 140, pairAddress: "pepe-pool", valuationPairAddress: "sol-pool", flowReversed: true });
  });
  it("never substitutes PEPE's cap when only the reversed pool is available", async () => {
    feed([reversed]);
    const result = await getPairMetrics("FEELSGOOD", "PEPE");
    expect(result.marketCap).toBeUndefined();
    expect(result.priceUsd).toBeUndefined();
    expect(result.priceChange24h).toBeUndefined();
    expect(result.buys1h).toBe(250);
  });
  it("ignores unrelated pairs even when their quote matches", async () => {
    feed([{ ...base, baseToken: { address: "UNRELATED" }, quoteToken: { address: "PEPE" } }]);
    expect(await getPairMetrics("FEELSGOOD", "PEPE")).toEqual({});
  });
  it("keeps normal flow and treats null valuation as missing", async () => {
    feed([{ ...base, marketCap: null, priceUsd: null }]);
    const result = await getPairMetrics("FEELSGOOD", "SOL");
    expect(result.buys5m).toBe(999);
    expect(result.marketCap).toBeUndefined();
    expect(result.priceUsd).toBeUndefined();
  });
});
