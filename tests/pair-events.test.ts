import { afterEach, describe, expect, it, vi } from "vitest";
import { announcementEvents, emptyMonitorState, observePairs, activePairEvent, formatPairEvent, pairLaunchFeedUrl } from "@/lib/pair-events";
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
