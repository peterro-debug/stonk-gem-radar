import { afterEach, expect, it, vi } from "vitest";
import { getStonkContext, listFirstPairLaunchesSince } from "@/lib/stonk";

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


it("preserves canonical STONK feed order for tied timestamps across pagination", async () => {
  const createdAt = "2026-09-18T21:21:08.245Z";
  const mk = (mint: string) => ({ mint, pool: `pool-${mint}`, quote: { mint: "quote" }, createdAt });
  // Newest-first API: page 1 is newer in feed order; page 2 is the oldest chunk.
  // Oldest-first canonical order must therefore be reverse(page2), then reverse(page1).
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    const page = new URL(url).searchParams.get("page");
    if (page === "1") return Response.json({ data: { tokens: [mk("new-2"), mk("new-1")], pagination: { total: 150 } } });
    if (page === "2") return Response.json({ data: { tokens: [mk("old-2"), mk("old-1")], pagination: { total: 150 } } });
    return Response.json({ data: { tokens: [] } });
  }));
  const first = await listFirstPairLaunchesSince("quote", 0, 3);
  expect(first.map(row => row.mint)).toEqual(["old-1", "old-2", "new-1"]);
});
