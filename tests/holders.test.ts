import { afterEach, expect, it, vi } from "vitest";
import { getHolderMetrics } from "@/lib/helius";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("does not turn a 6000-account partial sample into concentration percentages", async () => {
  vi.stubEnv("HELIUS_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => {
    const { page } = JSON.parse(init.body).params;
    return Response.json({ result: { token_accounts: Array.from({ length: 1000 }, (_, i) => ({
      address: `${page}-${i}`, owner: `${page}-${i}`, amount: 100,
    })) } });
  }));
  const h = await getHolderMetrics("mint", { creator: "not-in-sample", excludeTokenAccounts: ["vault"] });
  expect(h.sampleComplete).toBe(false);
  expect(h.holders).toBe(6000);
  expect(h.top10Pct).toBeUndefined();
  expect(h.creatorPct).toBeUndefined();
});
it("excludes pool accounts and aggregates multiple token accounts per owner", async () => {
  vi.stubEnv("HELIUS_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: { token_accounts: [
    { address: "vault", owner: "pool", amount: 999999 },
    { address: "a", owner: "creator", amount: 20 }, { address: "b", owner: "creator", amount: 30 },
    { address: "c", owner: "buyer", amount: 50 },
  ] } })));
  expect(await getHolderMetrics("mint", { creator: "creator", excludeTokenAccounts: ["vault"] }))
    .toMatchObject({ holders: 2, creatorPct: 50, top10Pct: 100, sampleComplete: true, poolExclusionKnown: true });
});
