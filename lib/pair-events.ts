import { containsPhrase, quoteAliases } from "./name-fit";
import type { PairEvent, QuoteMeta } from "./types";
import type { XCursor, XPost } from "./x-feed";

export const EVENT_WINDOW_MS = 48 * 60 * 60_000;
export const PAIR_MONITOR_TOKEN = "stonk-pair-monitor:v1";

export type PairMonitorState = {
  version: 1;
  initializedAt?: number;
  knownPairs: QuoteMeta[];
  events: PairEvent[];
  seenLaunches: Record<string, number>;
  pendingPosts: XPost[];
  x: XCursor;
  checkedAt?: number;
  registryLastSuccessAt?: number;
  launchesLastSuccessAt?: number;
  launchCursor?: number;
  registryError?: string;
  launchesError?: string;
  lastStartedCount?: number;
  discoveryLastSuccessAt?: number;
  discoveryError?: string;
  pendingNotifications?: PairEvent[];
  notificationError?: string;
};

export function emptyMonitorState(): PairMonitorState {
  return { version: 1, knownPairs: [], events: [], seenLaunches: {}, pendingPosts: [], x: { status: "not-configured" } };
}

export function observePairs(state: PairMonitorState, pairs: QuoteMeta[], now: number): { state: PairMonitorState; added: PairEvent[] } {
  const previous = new Set(state.knownPairs.map(p => p.mint));
  const added: PairEvent[] = state.initializedAt == null ? [] : pairs.filter(p => !previous.has(p.mint)).map(p => ({
    quoteMint: p.mint, detectedAt: now, source: "stonk-registry", sourceUrl: "https://www.stonkfun.xyz",
    description: `${p.name || p.symbol || p.mint} appeared in the official pair registry`,
  }));
  // Union prevents disappearance/reappearance during an API glitch creating a new event.
  const knownPairs = [...new Map([...state.knownPairs, ...pairs].map(p => [p.mint, p])).values()];
  return { state: { ...state, initializedAt: state.initializedAt ?? now, knownPairs,
    registryLastSuccessAt: now, registryError: undefined,
    events: [...state.events.filter(e => now - e.detectedAt <= EVENT_WINDOW_MS), ...added] }, added };
}

export function announcementEvents(posts: XPost[], pairs: QuoteMeta[], now: number): PairEvent[] {
  const events: PairEvent[] = [];
  for (const post of posts) {
    const text = post.text;
    const postedAt = Date.parse(post.created_at);
    if (now - postedAt > EVENT_WINDOW_MS || postedAt > now + 60_000) continue;
    // A mention alone is not a launch announcement. Future/negative wording is not confirmation.
    if (!/\b(pair|paired|pairing|pairs|parre|pare|parte|paring)\b/i.test(text)
      || !/\b(now|live|available|added|introducing|launched|launching|can|nå|lansert)\b/i.test(text)
      || /\b(not|isnt|isn't|soon|tomorrow|rumou?r|ikke|snart)\b/i.test(text)) continue;
    for (const quote of pairs) {
      if (!quoteAliases(quote).some(alias => containsPhrase(text, alias))) continue;
      events.push({ quoteMint: quote.mint, detectedAt: postedAt, source: "x-announcement",
        sourceUrl: `https://x.com/i/status/${post.id}`, description: text.slice(0, 350) });
    }
  }
  return events;
}

export function activePairEvent(events: PairEvent[], quoteMint: string, now: number): PairEvent | undefined {
  return events.filter(event => event.quoteMint === quoteMint && now >= event.detectedAt
    && now - event.detectedAt <= EVENT_WINDOW_MS).sort((a, b) => b.detectedAt - a.detectedAt)[0];
}

export function formatPairEvent(event: PairEvent, quote?: QuoteMeta): string {
  return ["🆕 STONK — NY PARHENDELSE", `${quote?.name || quote?.symbol || event.quoteMint}`,
    `Kilde: ${event.source === "stonk-registry" ? "Stonks parregister" : "X-annonse, matchet mot parregisteret"}`,
    event.description, `Oppdaget: ${new Date(event.detectedAt).toISOString()}`,
    "Radaren følger nye tokens og vurderer navn, marked og wallet-risiko.",
    "Dette er et oppdagelsesvarsel. Ingen kjøp eller GEM-godkjenning.", event.sourceUrl].join("\n");
}
