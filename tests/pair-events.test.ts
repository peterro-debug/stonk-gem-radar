import { afterEach, describe, expect, it, vi } from "vitest";
import { announcementEvents, emptyMonitorState, observePairs, activePairEvent, formatPairEvent, formatPairLaunchAlert, pairLaunchFeedUrl } from "@/lib/pair-events";
import { nameAssociation } from "@/lib/name-fit";
import { pollOfficialX } from "@/lib/x-feed";
import { pollPairSources } from "@/workflows/pair-monitor";

const now = Date.parse("2026-09-19T19:00:00Z");
const pepe = { mint: "pepe", symbol: "PEPE", name: "Pepe" };
const google = { mint: "google", symbol: "GOOGLx", name: "Alphabet xStock" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("new pair events and name relationships", () => {
  it("baselines existing pairs and reports a new quote once, including after serialized handoff", () => {
    const initial = observePairs(emptyMonitorState(), [pepe], now);
    expect(initial.added).toEqual([]);
    const next = observePairs(JSON.parse(JSON.stringify(initial.state)), [pepe, google], now + 60_000);
    expect(next.added.map(e => e.quoteMint)).toEqual(["google"]);
    const disappeared = observePairs(next.state, [pepe], now + 120_000);
    expect(observePairs(disappeared.state, [pepe, google], now + 180_000).added).toEqual([]);
  });
  it("labels only registry additions as a new main pair and includes the exact filtered launch feed", () => {
    const event = { quoteMint: "pepe", detectedAt: now, source: "stonk-registry" as const,
      sourceUrl: "https://www.stonkfun.xyz", description: "Pepe appeared in the official pair registry" };
    const message = formatPairEvent(event, { ...pepe, category: "custom" });
    expect(message).toContain("NY MAIN PAIR / QUOTE AKTIVERT");
    expect(message).toContain("Quote mint: pepe");
    expect(message).toContain("Kategori: custom");
    expect(message).toContain(pairLaunchFeedUrl("pepe"));
    expect(message).toContain("quoteMint=pepe&sort=newest&page=1&pageSize=100");
    expect(message).not.toContain("%26sort");
  });
  it("formats ranked child launches clearly", () => {
    const event = { quoteMint: "pepe", detectedAt: now, source: "stonk-registry" as const,
      sourceUrl: "https://www.stonkfun.xyz", description: "Pepe appeared in the official pair registry" };
    const message = formatPairLaunchAlert({ rank: 1, quoteMint: "pepe", mint: "child",
      name: "FEELSGOOD", launchedAt: now + 1000, event }, pepe);
    expect(message).toContain("PEPE LAUNCH #1");
    expect(message).toContain("FEELSGOOD / PEPE");
    expect(message).toContain("STONK-feed rank: #1");
  });
  it("does not mislabel an X confirmation as a new registry addition", () => {
    const event = { quoteMint: "pepe", detectedAt: now, source: "x-announcement" as const,
      sourceUrl: "https://x.com/i/status/123", description: "You can now pair with PEPE" };
    const message = formatPairEvent(event, pepe);
    expect(message).toContain("MAIN PAIR ANNONSERT / BEKREFTET");
    expect(message).not.toContain("NY MAIN PAIR / QUOTE AKTIVERT");
  });
  it("connects Google It, Feeling Lucky and FEELSGOOD to their proper assets", () => {
    expect(nameAssociation({ name: "Google It", symbol: "GOOGLEIT" }, google).matched).toBe(true);
    expect(nameAssociation({ name: "Feeling Lucky", symbol: "LUCKY" }, google).matched).toBe(true);
    expect(nameAssociation({ name: "FEELSGOOD", symbol: "FEELSGOOD" }, pepe).matched).toBe(true);
    expect(nameAssociation({ name: "Feeling Lucky" }, pepe).matched).toBe(false);
  });
  it("does not match tiny substrings such as AI in CHAIR or SOL in ISOLATED", () => {
    expect(nameAssociation({ name: "Chair", symbol: "CHAIR" }, { symbol: "NVDAx", name: "Nvidia" }).matched).toBe(false);
    expect(nameAssociation({ name: "Isolated", symbol: "ISO" }, { symbol: "SOL", name: "Solana" }).matched).toBe(false);
  });
  it("requires announcement language and a quote already present in the registry", () => {
    const post = { id: "123", created_at: new Date(now).toISOString(), text: "You can now pair with Google!" };
    expect(announcementEvents([post], [pepe], now)).toEqual([]);
    expect(announcementEvents([post], [pepe, google], now)[0]).toMatchObject({ quoteMint: "google", source: "x-announcement" });
    expect(announcementEvents([{ ...post, text: "Google earnings look good" }], [google], now)).toEqual([]);
    expect(announcementEvents([{ ...post, text: "Google pairing is not live" }], [google], now)).toEqual([]);
    expect(announcementEvents([{ ...post, text: "Google pairing available soon" }], [google], now)).toEqual([]);
  });
  it("expires pair events after 48 hours", () => {
    const state = observePairs(observePairs(emptyMonitorState(), [pepe], now).state, [pepe, google], now + 1).state;
    expect(activePairEvent(state.events, "google", now + 49 * 3600_000)).toBeUndefined();
  });
});

describe("source failures and X cursor", () => {
  it("rescans active older concepts every 30 minutes without duplicating launch entries", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const time = Date.now();
    const row = { mint: "older-active", pool: "pool", quote: pepe, createdAt: new Date(time - 86400_000).toISOString(),
      market: { marketCapUsd: 100_000, volume24hUsd: 50_000, priceChange24h: 50 } };
    const fetcher = vi.fn().mockImplementation(async (url: string) => Response.json(url.endsWith("/pairs")
      ? { data: { pairs: [pepe] } } : { data: { tokens: [row] } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await pollPairSources(emptyMonitorState());
    expect(result.launches.map(l => l.mint)).toEqual(["older-active"]);
    expect(result.state.discoveryLastSuccessAt).toBeGreaterThan(0);
    fetcher.mockClear();
    expect((await pollPairSources(result.state)).launches).toEqual([]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("sort=volume"))).toHaveLength(0);
  });
  it("keeps fresh main-pair launches visible and ranks #1-#3 when the global feed is saturated", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    vi.stubEnv("STONK_LAUNCH_SCAN_MAX_PAGES", "2");
    const time = Date.now();
    let state = observePairs(emptyMonitorState(), [pepe], time - 120_000).state;
    state.discoveryLastSuccessAt = time;
    const ranked = [
      { mint: "child-3", pool: "pool-3", quote: google, name: "THREE", createdAt: new Date(time - 10_000).toISOString() },
      { mint: "child-1", pool: "pool-1", quote: google, name: "ONE", createdAt: new Date(time - 30_000).toISOString() },
      { mint: "child-2", pool: "pool-2", quote: google, name: "TWO", createdAt: new Date(time - 20_000).toISOString() },
      { mint: "child-4", pool: "pool-4", quote: google, name: "FOUR", createdAt: new Date(time - 5_000).toISOString() },
    ];
    const overflow = Array.from({ length: 100 }, (_, i) => ({
      mint: `global-${i}`, pool: `pool-${i}`, quote: pepe,
      createdAt: new Date(time - i * 100).toISOString(),
    }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [pepe, google] } });
      if (url.includes("quoteMint=google")) return Response.json({ data: { tokens: ranked, pagination: { total: 4 } } });
      if (url.includes("/tokens?sort=newest")) return Response.json({ data: { tokens: overflow } });
      return Response.json({ data: { tokens: [] } });
    }));
    const result = await pollPairSources(state);
    expect(result.state.launchesError).toBeUndefined();
    expect(result.state.pairLaunchesLastSuccessAt).toBeGreaterThan(0);
    expect(result.pairLaunchAlerts.map(a => [a.rank, a.mint])).toEqual([
      [1, "child-1"], [2, "child-2"], [3, "child-3"],
    ]);
    expect(result.launches).toEqual(expect.arrayContaining([
      expect.objectContaining({ mint: "child-1", pairEvent: expect.objectContaining({ quoteMint: "google" }) }),
    ]));
  });
  it("freezes assigned launch ranks if an older row is indexed later", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const time = Date.now();
    let state = observePairs(emptyMonitorState(), [pepe], time - 120_000).state;
    state.discoveryLastSuccessAt = time;
    let pairRows = [
      { mint: "seen-first", pool: "p1", quote: google, name: "SEEN FIRST", createdAt: new Date(time - 20_000).toISOString() },
    ];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [pepe, google] } });
      if (url.includes("quoteMint=google")) return Response.json({ data: { tokens: pairRows, pagination: { total: pairRows.length } } });
      return Response.json({ data: { tokens: [] } });
    }));
    const first = await pollPairSources(state);
    expect(first.pairLaunchAlerts.map(a => [a.rank, a.mint])).toEqual([[1, "seen-first"]]);
    state = first.state;
    // Simulate successful Telegram delivery of #1 before the next API poll.
    state.pairLaunchWatches!.google.notifiedMints["seen-first"] = 1;
    pairRows = [
      { mint: "seen-first", pool: "p1", quote: google, name: "SEEN FIRST", createdAt: new Date(time - 20_000).toISOString() },
      { mint: "late-older", pool: "p0", quote: google, name: "LATE OLDER", createdAt: new Date(time - 30_000).toISOString() },
      { mint: "next", pool: "p2", quote: google, name: "NEXT", createdAt: new Date(time - 10_000).toISOString() },
    ];
    const second = await pollPairSources(state);
    expect(second.state.pairLaunchWatches!.google.ranked.map(x => x.mint)).toEqual(["seen-first", "late-older", "next"]);
    expect(second.pairLaunchAlerts.map(a => [a.rank, a.mint])).toEqual([[2, "late-older"], [3, "next"]]);
    expect(second.pairLaunchAlerts.some(a => a.rank === 1 && a.mint !== "seen-first")).toBe(false);
  });

  it("replays the real PEPE first-three feed order through registry-to-Telegram ranking", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const PEPE = "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m";
    const pepeQuote = { mint: PEPE, symbol: "PEPE", name: "Pepe" };
    const eventTime = Date.parse("2026-09-18T21:21:20Z");
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(eventTime);
    try {
      let state = observePairs(emptyMonitorState(), [google], eventTime - 60_000).state;
      state.discoveryLastSuccessAt = eventTime;
      // Captured from the complete live STONK quote history. The API is
      // newest-first, so these three are supplied in reverse of the desired
      // oldest-first Telegram order.
      const rows = [
        { mint: "8pCYnTGuzeLEs5PQkB9pofFrKetSgxySYffCXDwQy8hf", pool: "pepe-p3",
          name: "Apu", symbol: "Apu", quote: pepeQuote, createdAt: "2026-09-18T21:21:08.245Z" },
        { mint: "XX5kkTT8HGTEdQTCjHUSmihmZKUki3SuFzKT37RkCTL", pool: "pepe-p2",
          name: "PEPE BY MATT FURIRE", symbol: "PEPE", quote: pepeQuote, createdAt: "2026-09-18T21:21:08.245Z" },
        { mint: "7ZG8CUGtNxr4WuUbXfm14MUHLPLaz2aYsxHWDo9uSTNK", pool: "pepe-p1",
          name: "Pepes Dog", symbol: "ZEUS", quote: pepeQuote, createdAt: "2026-09-18T21:21:08.245Z" },
      ];
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [google, pepeQuote] } });
        if (url.includes(`quoteMint=${PEPE}`)) return Response.json({ data: { tokens: rows, pagination: { total: 3 } } });
        return Response.json({ data: { tokens: [] } });
      }));
      const result = await pollPairSources(state);
      expect(result.events).toEqual([expect.objectContaining({ quoteMint: PEPE, source: "stonk-registry" })]);
      expect(result.pairLaunchAlerts.map(a => [a.rank, a.name])).toEqual([
        [1, "Pepes Dog"],
        [2, "PEPE BY MATT FURIRE"],
        [3, "Apu"],
      ]);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it("replays the real BlackBerry first-three feed order through registry-to-Telegram ranking", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const BLACKBERRY = "BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy";
    const blackberry = { mint: BLACKBERRY, symbol: "BB", name: "BlackBerry" };
    const eventTime = Date.parse("2026-09-19T16:06:30Z");
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(eventTime);
    try {
      let state = observePairs(emptyMonitorState(), [pepe], eventTime - 60_000).state;
      state.discoveryLastSuccessAt = eventTime;
      // Complete historical API order at the earliest timestamp: #1 catonfone,
      // #2 Black Berry, #3 LEFT ON READ. Input is newest-first.
      const blackberryRows = [
        { mint: "4oiwwTYCAkscu6bduumQArRYKiEGpTGmidBeSNtuZu7b", pool: "bb-p3",
          name: "LEFT ON READ", symbol: "LEFTONREAD", quote: blackberry, createdAt: "2026-09-19T16:06:19.729Z" },
        { mint: "ETBqAeJvHmafXoBQcyEta2VEbTiWCgBS8By2Yig2k1c5", pool: "bb-p2",
          name: "Black Berry", symbol: "BLACKBERRY", quote: blackberry, createdAt: "2026-09-19T16:06:19.729Z" },
        { mint: "8hm78B3Gd1QEsJ8jaEY5X8cx6atTex4ossBaXZeD8CGD", pool: "bb-p1",
          name: "catonfone", symbol: "fone", quote: blackberry, createdAt: "2026-09-19T16:06:19.729Z" },
      ];
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [pepe, blackberry] } });
        if (url.includes(`quoteMint=${BLACKBERRY}`)) {
          return Response.json({ data: { tokens: blackberryRows, pagination: { total: 3 } } });
        }
        return Response.json({ data: { tokens: [] } });
      }));
      const result = await pollPairSources(state);
      expect(result.events).toEqual([expect.objectContaining({ quoteMint: BLACKBERRY, source: "stonk-registry" })]);
      expect(result.pairLaunchAlerts.map(a => [a.rank, a.mint, a.name])).toEqual([
        [1, "8hm78B3Gd1QEsJ8jaEY5X8cx6atTex4ossBaXZeD8CGD", "catonfone"],
        [2, "ETBqAeJvHmafXoBQcyEta2VEbTiWCgBS8By2Yig2k1c5", "Black Berry"],
        [3, "4oiwwTYCAkscu6bduumQArRYKiEGpTGmidBeSNtuZu7b", "LEFT ON READ"],
      ]);
      expect(result.state.pairLaunchWatches?.[BLACKBERRY]?.ranked.map(x => x.mint)).toEqual(
        result.pairLaunchAlerts.map(a => a.mint),
      );
    } finally {
      dateSpy.mockRestore();
    }
  });

  it("does not emit duplicate #1/#2/#3 alerts after successful delivery bookkeeping", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const time = Date.now();
    let state = observePairs(emptyMonitorState(), [pepe], time - 120_000).state;
    state.discoveryLastSuccessAt = time;
    const rows = [
      { mint: "one", pool: "p1", quote: google, name: "ONE", createdAt: new Date(time - 30_000).toISOString() },
      { mint: "two", pool: "p2", quote: google, name: "TWO", createdAt: new Date(time - 20_000).toISOString() },
      { mint: "three", pool: "p3", quote: google, name: "THREE", createdAt: new Date(time - 10_000).toISOString() },
    ];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [pepe, google] } });
      if (url.includes("quoteMint=google")) return Response.json({ data: { tokens: [...rows].reverse(), pagination: { total: 3 } } });
      return Response.json({ data: { tokens: [] } });
    }));
    const first = await pollPairSources(state);
    expect(first.pairLaunchAlerts.map(a => a.rank)).toEqual([1, 2, 3]);
    state = first.state;
    for (const alert of first.pairLaunchAlerts) {
      state.pairLaunchWatches!.google.notifiedMints[alert.mint] = alert.rank;
    }
    const second = await pollPairSources(state);
    expect(second.pairLaunchAlerts).toEqual([]);
    expect(second.state.pairLaunchWatches!.google.ranked).toHaveLength(3);
  });

  it("does not retroactively create ranked Telegram alerts for pair events from before this code was watching them", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const time = Date.now();
    let state = observePairs(emptyMonitorState(), [pepe], time - 120_000).state;
    state = observePairs(state, [pepe, google], time - 60_000).state;
    state.discoveryLastSuccessAt = time;
    const child = { mint: "old-child", pool: "old-pool", quote: google,
      createdAt: new Date(time - 50_000).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [pepe, google] } });
      if (url.includes("quoteMint=google")) return Response.json({ data: { tokens: [child], pagination: { total: 1 } } });
      return Response.json({ data: { tokens: [] } });
    }));
    const result = await pollPairSources(state);
    expect(result.pairLaunchAlerts).toEqual([]);
  });
  it("advances the global launch cursor while draining a backlog", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const time = Date.now();
    let state = observePairs(emptyMonitorState(), [pepe], time - 120_000).state;
    state = { ...state, launchCursor: time - 60_000, discoveryLastSuccessAt: time };
    const rows = Array.from({ length: 30 }, (_, i) => ({
      mint: `fresh-${i}`, pool: `pool-${i}`, quote: pepe,
      createdAt: new Date(time - (30 - i) * 1000).toISOString(),
    }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/pairs")) return Response.json({ data: { pairs: [pepe] } });
      if (url.includes("/tokens?sort=newest")) return Response.json({ data: { tokens: rows } });
      return Response.json({ data: { tokens: [] } });
    }));
    const result = await pollPairSources(state);
    expect(result.launches).toHaveLength(25);
    expect(result.state.launchCursor).toBe(Date.parse(rows[24].createdAt));
    expect(result.state.launchCursor).toBeGreaterThan(time - 60_000);
  });
  it("reports X as not configured without making a request", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn());
    expect((await pollOfficialX({ status: "not-configured" }, now)).cursor.status).toBe("not-configured");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("baselines old posts, uses since_id later, and retains the cursor after a 429", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "test"); vi.stubEnv("X_STONK_USER_ID", "42");
    const post = (id: string) => ({ id, text: "Google pairing now live", created_at: new Date(now).toISOString(), author_id: "42" });
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ data: [post("100")] }))
      .mockResolvedValueOnce(Response.json({ data: [post("101")] })).mockResolvedValueOnce(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", mock);
    const first = await pollOfficialX({ status: "not-configured" }, now);
    expect(first.posts).toEqual([]);
    const next = await pollOfficialX(first.cursor, now + 300_000);
    expect(next.posts.map(p => p.id)).toEqual(["101"]);
    expect(mock.mock.calls[1][0]).toContain("since_id=100");
    const failed = await pollOfficialX(next.cursor, now + 600_000);
    expect(failed.cursor).toMatchObject({ status: "error", sinceId: "101", lastSuccessAt: now + 300_000 });
  });
  it("rejects timeline data with the wrong author", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "test"); vi.stubEnv("X_STONK_USER_ID", "42");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "100", text: "pair now live", created_at: new Date(now).toISOString(), author_id: "9" }] })));
    expect((await pollOfficialX({ status: "not-configured" }, now)).cursor.status).toBe("error");
  });
  it("retains the baseline on registry failure while launch discovery still works", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "");
    const time = Date.now();
    const state = observePairs(emptyMonitorState(), [pepe], time - 60_000).state;
    const row = { mint: "fresh", pool: "pool", quote: pepe, createdAt: new Date(time - 10_000).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/pairs")
      ? new Response("", { status: 503 }) : Response.json({ data: { tokens: [row] } })));
    const result = await pollPairSources(state);
    expect(result.state.knownPairs).toEqual([pepe]);
    expect(result.state.registryError).toContain("503");
    expect(result.launches.map(l => l.mint)).toEqual(["fresh"]);
    expect((await pollPairSources(result.state)).launches).toEqual([]);
  });
});
