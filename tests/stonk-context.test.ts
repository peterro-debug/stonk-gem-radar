import { afterEach, expect, it, vi } from "vitest";
import { getStonkContext } from "@/lib/stonk";

afterEach(() => vi.unstubAllGlobals());
it("reads the creator from matching launch detail and marks incomplete pair catalogues honestly", async () => {
  const creator = "8YKTJbhh4na6WFBm8cdgn8t2NqVezNRd9QqRaEHFdJmc";
  const row = { mint: "mint", name: "New Concept", quote: { mint: "quote" }, createdAt: new Date().toISOString() };
  let detailMint = "mint";
  let total = 1;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => Response.json(
    url.includes("?") ? { data: { tokens: [row], pagination: { total } } }
      : url.endsWith("/rewards") ? { data: {} }
      : { data: { token: { ...row, mint: detailMint }, launch: { mint: detailMint, creator } } })));
  const valid = await getStonkContext("mint", "quote");
  expect(valid.creator).toBe(creator);
  expect(valid.catalogue.pairCoverageComplete).toBe(true);
  total = 501;
  expect((await getStonkContext("mint", "quote")).catalogue.pairCoverageComplete).toBe(false);
  detailMint = "another-mint";
  expect((await getStonkContext("mint", "quote")).creator).toBeUndefined();
});
it("compares recent and leading windows on established pairs without claiming full history", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ mint: `mint-${i}`, name: `Concept ${i}`,
    quote: { mint: "quote" }, createdAt: new Date(Date.now() - i * 60_000).toISOString() }));
  let leadersFail = false;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("sort=marketCap") && leadersFail) return new Response("unavailable", { status: 503 });
    return Response.json(url.includes("?") ? { data: { tokens: rows, pagination: { total: 626 } } }
      : url.endsWith("/rewards") ? { data: {} } : { data: { token: rows[0] } });
  }));
  expect((await getStonkContext("mint-0", "quote")).catalogue).toMatchObject({ pairComparisonReady: true, pairCoverageComplete: false });
  leadersFail = true;
  expect((await getStonkContext("mint-0", "quote")).catalogue.pairComparisonReady).toBe(false);
});
