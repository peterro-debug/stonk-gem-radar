import type { FttWatch } from "./ftt-watch";
import { containsPhrase, quoteAliases } from "./name-fit";
import type { PairEvent, QuoteMeta } from "./types";
import type { XCursor, XPost } from "./x-feed";

export const EVENT_WINDOW_MS = 48 * 60 * 60_000;
export const PAIR_MONITOR_TOKEN = "stonk-pair-monitor:v1";

export type PairCohortMember = {
  rank: number;
  mint: string;
  name?: string;
  symbol?: string;
  launchedAt: number;
  checkedAt: number;
  marketCap?: number;
  liquidityUsd?: number;
  volume5m?: number;
  volume24h?: number;
  buys5m?: number;
  sells5m?: number;
  status?: string;
  graduationProgress?: number;
  peakMarketCap?: number;
  peakVolume5m?: number;
  peakBuys5m?: number;
};

export type PairMomentumAlert = PairCohortMember & {
  quoteMint: string;
  event: PairEvent;
  reason: string;
};

export type PairLaunchWatch = {
  eventDetectedAt: number;
  // Once a slot is assigned it never shifts. This prevents a delayed API row
  // from causing two different tokens to be announced as "#1".
  ranked: Array<{ mint: string; name?: string; symbol?: string; launchedAt: number }>;
  notifiedMints: Record<string, number>;
  // Lightweight first-200 cohort. Heavy wallet/holder work is only promoted
  // when activity appears, keeping burst monitoring fast and affordable.
  cohort?: PairCohortMember[];
  momentumNotified?: Record<string, number>;
};

export type PairLaunchAlert = {
  rank: 1 | 2 | 3;
  quoteMint: string;
  mint: string;
  name?: string;
  symbol?: string;
  launchedAt: number;
  event: PairEvent;
};

export type PairMonitorState = {
  version: 1;
  fttWatch?: FttWatch;
  initializedAt?: number;
  knownPairs: QuoteMeta[];
  events: PairEvent[];
  seenLaunches: Record<string, number>;
  pendingPosts: XPost[];
  x: XCursor;
  checkedAt?: number;
  registryLastSuccessAt?: number;
  launchesLastSuccessAt?: number;
  pairLaunchesLastSuccessAt?: number;
  launchCursor?: number;
  registryError?: string;
  launchesError?: string;
  pairLaunchesError?: string;
  pairLaunchWatches?: Record<string, PairLaunchWatch>;
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

export function pairLaunchFeedUrl(quoteMint: string): string {
  return `https://www.stonkfun.xyz/api/public/v1/tokens?quoteMint=${encodeURIComponent(quoteMint)}&sort=newest&page=1&pageSize=100`;
}

export function formatPairEvent(event: PairEvent, quote?: QuoteMeta): string {
  const display = quote?.name && quote?.symbol && quote.name.toUpperCase() !== quote.symbol.toUpperCase()
    ? `${quote.name} (${quote.symbol})` : quote?.name || quote?.symbol || event.quoteMint;
  const registryAddition = event.source === "stonk-registry";
  return [
    registryAddition ? "🚨 STONK — NY MAIN PAIR / QUOTE AKTIVERT" : "📣 STONK — MAIN PAIR ANNONSERT / BEKREFTET",
    display,
    registryAddition
      ? "Bekreftet: en ny quote-mint er lagt til i Stonks offisielle pair-register."
      : "Bekreftet: annonsert på X og matchet mot en quote som finnes i Stonks offisielle pair-register.",
    `Quote mint: ${event.quoteMint}`,
    quote?.category ? `Kategori: ${quote.category}` : undefined,
    `Kilde: ${registryAddition ? "Stonks offisielle /pairs-register" : "X-annonse + Stonks /pairs-register"}`,
    `Oppdaget av radaren: ${new Date(event.detectedAt).toISOString()}`,
    `Live nye launches: ${pairLaunchFeedUrl(event.quoteMint)}`,
    "Radaren følger nye launches mot denne main pairen.",
    "Telegram varsler separat når launch #1, #2 og #3 dukker opp.",
    "Dette varslet gjelder quote/main pairen – child-tokens er ikke automatisk godkjent eller kjøpssignaler.",
    event.sourceUrl,
  ].filter((line): line is string => Boolean(line)).join("\n");
}


export function formatPairLaunchAlert(alert: PairLaunchAlert, quote?: QuoteMeta): string {
  const q = quote?.symbol || quote?.name || alert.quoteMint;
  const token = alert.name || alert.symbol || alert.mint;
  return [
    `⚡ STONK — ${q} LAUNCH #${alert.rank}`,
    `${token} / ${q}`,
    `STONK-feed rank: #${alert.rank}`,
    `Token mint: ${alert.mint}`,
    `Opprettet: ${new Date(alert.launchedAt).toISOString()}`,
    "Radaren starter analyse så snart markeds- og pooldata er klare. Dette er et rått discovery-varsel, ikke GEM-godkjenning.",
  ].join("\n");
}


export function pairMomentumReason(member: PairCohortMember, now = Date.now()): string | undefined {
  const ageMinutes = Math.max(0, (now - member.launchedAt) / 60_000);
  if (ageMinutes > 120) return undefined;
  const buys = member.buys5m ?? 0;
  const sells = member.sells5m ?? 0;
  const volume5m = member.volume5m ?? 0;
  const volume24h = member.volume24h ?? 0;
  const mc = member.marketCap ?? 0;
  const graduated = member.status === "graduated" || (member.graduationProgress ?? 0) >= 1;

  if (graduated && ageMinutes <= 60) return "graduated within the first hour";
  if (buys >= 20 && volume5m >= 1_500 && buys >= Math.max(1, sells) * 1.1) {
    return `${buys} buys / 5m with ${Math.round(volume5m)} USD 5m volume and positive buy pressure`;
  }
  if (buys >= 8 && volume5m >= 5_000) return `${Math.round(volume5m)} USD 5m volume with ${buys} buys`;
  if (mc >= 50_000 && volume24h >= 15_000) return `market cap ${Math.round(mc)} USD with ${Math.round(volume24h)} USD launch-period volume`;
  if (mc >= 100_000) return `market cap crossed ${Math.round(mc)} USD`;
  return undefined;
}

function compactUsd(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "ukjent";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function formatPairMomentumAlert(alert: PairMomentumAlert, quote?: QuoteMeta): string {
  const q = quote?.symbol || quote?.name || alert.quoteMint;
  const token = alert.name && alert.symbol && alert.name.toUpperCase() !== alert.symbol.toUpperCase()
    ? `${alert.name} (${alert.symbol})` : alert.name || alert.symbol || alert.mint;
  return [
    `🔥 STONK — ${q} FIRST-200 MOMENTUM`,
    `${token} / ${q}`,
    `STONK-feed cohort: #${alert.rank} av første 200`,
    `MC ${compactUsd(alert.marketCap)} · Likviditet ${compactUsd(alert.liquidityUsd)}`,
    `Volum 5m ${compactUsd(alert.volume5m)} · Launch/24h ${compactUsd(alert.volume24h)}`,
    `Buys/sells 5m: ${alert.buys5m ?? "ukjent"}/${alert.sells5m ?? "ukjent"}`,
    `Trigger: ${alert.reason}`,
    `Token mint: ${alert.mint}`,
    "Full wallet-, holder- og risikokontroll er satt i gang. Dette er et momentum/discovery-varsel, ikke GEM-godkjenning.",
  ].join("\n");
}
