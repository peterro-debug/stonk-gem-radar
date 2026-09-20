import { afterEach, expect, it, vi } from "vitest";
import { getTraderMetrics } from "@/lib/helius";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("counts unique buyers for API-discovered launches when the vault is unavailable", async () => {
  vi.stubEnv("HELIUS_API_KEY", "test");
  const now = Date.now();
  const txs = [
    { timestamp: Math.floor((now - 5_000) / 1000), feePayer: "buyer-a",
      tokenTransfers: [{ mint: "mint", fromUserAccount: "pool-authority", toUserAccount: "buyer-a" }] },
    { timestamp: Math.floor((now - 4_000) / 1000), feePayer: "buyer-b",
      tokenTransfers: [{ mint: "mint", fromUserAccount: "pool-authority", toUserAccount: "buyer-b" }] },
    { timestamp: Math.floor((now - 3_000) / 1000), feePayer: "buyer-a",
      tokenTransfers: [{ mint: "mint", fromUserAccount: "pool-authority", toUserAccount: "buyer-a" }] },
    { timestamp: Math.floor((now - 2_000) / 1000), feePayer: "seller-a",
      tokenTransfers: [{ mint: "mint", fromUserAccount: "seller-a", toUserAccount: "pool-authority" }] },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(txs)));
  const result = await getTraderMetrics("pool", "mint", undefined, now - 60_000);
  expect(result).toMatchObject({
    uniqueBuyers: 2,
    uniqueSellers: 1,
    uniqueTraders: 3,
    sampledSwaps: 4,
    directionMethod: "fee-payer",
    approximate: true,
  });
});

it("keeps exact vault-direction classification when the token vault is known", async () => {
  vi.stubEnv("HELIUS_API_KEY", "test");
  const now = Date.now();
  const txs = [
    { timestamp: Math.floor((now - 2_000) / 1000), feePayer: "router",
      tokenTransfers: [{ mint: "mint", fromTokenAccount: "vault", toUserAccount: "buyer-a" }] },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(txs)));
  const result = await getTraderMetrics("pool", "mint", "vault", now - 60_000);
  expect(result).toMatchObject({ uniqueBuyers: 1, directionMethod: "vault", approximate: false });
});
