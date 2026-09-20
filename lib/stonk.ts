import { STONK_REWARD_CONFIG, STONK_STANDARD_CONFIG } from "./constants";
import type { Launch, PairMetrics, QuoteMeta, RewardMetrics, StonkMetrics, TokenMeta } from "./types";

const DEFAULT_BASE = "https://www.stonkfun.xyz/api/public/v1";

function baseUrl(): string {
  return (process.env.STONKFUN_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

function num(value: unknown): number | undefined {
  if (value == null || value === "" || typeof value === "boolean") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function getJson(path: string): Promise<any | undefined> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

export type StonkTokenRow = {
  mint: string;
  pool?: string;
  name?: string;
  symbol?: string;
  creator?: string;
  quote?: {
    mint?: string;
    symbol?: string;
    name?: string;
    logoUrl?: string;
    category?: string;
  };
  launchpad?: string;
  mode?: string;
  transferFee?: { bps?: number };
  imageUrl?: string;
  market?: {
    priceUsd?: number;
    marketCapUsd?: number;
    fdvUsd?: number;
    volume24hUsd?: number;
    liquidityUsd?: number;
    priceChange24h?: number;
    peakMarketCapUsd?: number;
  };
  status?: string;
  graduationProgress?: number;
  graduatedAt?: string;
  createdAt?: string;
};

export type StonkContext = {
  token: TokenMeta;
  quote: QuoteMeta;
  pair: PairMetrics;
  rewards: RewardMetrics;
  stonk: StonkMetrics;
  creator?: string;
  catalogue: { rows: StonkTokenRow[]; pairCoverageComplete: boolean; pairComparisonReady: boolean };
};

function recentPairMints(): Set<string> {
  return new Set(
    (process.env.RECENT_PAIR_MINTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

async function getPairLaunchContext(quoteMint: string, mint: string) {
  const manualEvent = recentPairMints().has(quoteMint);
  const body = await getJson(`/tokens?quoteMint=${encodeURIComponent(quoteMint)}&sort=newest&page=1&pageSize=100`);
  const rows: StonkTokenRow[] = Array.isArray(body?.data?.tokens) ? body.data.tokens : [];
  const launchCount = num(body?.data?.pagination?.total);
  const validRows = (batch: StonkTokenRow[]) => batch.every(row => row.quote?.mint === quoteMint
    && row.mint && row.name && Number.isFinite(Date.parse(row.createdAt || "")));
  const newestComplete = launchCount != null && launchCount > 0 && new Set(rows.map(r => r.mint)).size === Math.min(100, launchCount) && validRows(rows);
  const pairCoverageComplete = newestComplete && launchCount! <= 100;
  // Established pairs contain hundreds/thousands of launches. Compare two
  // complete, declared windows instead of silently requiring all-time coverage.
  let pairComparisonReady = pairCoverageComplete;
  if (newestComplete && !pairCoverageComplete) {
    const leaders = await getJson(`/tokens?quoteMint=${encodeURIComponent(quoteMint)}&sort=marketCap&page=1&pageSize=100`);
    const batch: StonkTokenRow[] = Array.isArray(leaders?.data?.tokens) ? leaders.data.tokens : [];
    const leaderTotal = num(leaders?.data?.pagination?.total);
    pairComparisonReady = leaderTotal != null && leaderTotal > 0 && new Set(batch.map(r => r.mint)).size === Math.min(100, leaderTotal) && validRows(batch);
    rows.push(...batch);
  }
  const uniqueRows = [...new Map(rows.map(row => [row.mint, row])).values()];

  let launchRank: number | undefined;
  if (pairCoverageComplete) {
    const unique = [...new Map(rows.map((row) => [row.mint, row])).values()]
      .filter((row) => row.createdAt)
      .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
    const index = unique.findIndex((row) => row.mint === mint);
    if (index >= 0) launchRank = index + 1;
  }

  const isFirstMover = launchRank != null && launchRank <= 3;
  return {
    rows: uniqueRows,
    pairCoverageComplete,
    pairComparisonReady,
    launchCount,
    launchRank,
    isFirstMover,
    // First-mover rank is not proof of a new pair. Durable registry/X events
    // are attached by the monitor/analyzer; manual entries remain explicit.
    isNewPair: manualEvent,
  };
}

async function getRewards(mint: string, fallbackMode?: string, fallbackFeeBps?: number, quote?: StonkTokenRow["quote"]): Promise<RewardMetrics> {
  const body = await getJson(`/tokens/${encodeURIComponent(mint)}/rewards`);
  const data = body?.data;
  const rewards = data?.rewards;
  const mode = data?.mode || fallbackMode;
  const rewardMint = data?.quote?.mint || quote?.mint;
  const rewardSymbol = data?.quote?.symbol || quote?.symbol;

  return {
    mode,
    transferFeeBps: num(data?.transferFee?.bps) ?? fallbackFeeBps,
    rewardMint,
    rewardSymbol,
    distributedTokens: num(rewards?.distributedTokens),
    undistributedTokens: num(rewards?.undistributedTokens),
    payoutCount: num(rewards?.payoutCount),
    rewardedHolders: num(rewards?.holderCount),
    lastPayoutAt: rewards?.lastPayoutAt,
    nativeQuoteReward: mode === "reward" && Boolean(rewardMint && rewardMint === quote?.mint),
  };
}

export async function getStonkContext(mint: string, quoteMint: string): Promise<StonkContext> {
  const [detailBody, pairContext] = await Promise.all([
    getJson(`/tokens/${encodeURIComponent(mint)}`),
    getPairLaunchContext(quoteMint, mint),
  ]);

  const row: StonkTokenRow = detailBody?.data?.token?.mint === mint ? detailBody.data.token : {} as StonkTokenRow;
  const launch = row.mint === mint && (!detailBody?.data?.launch?.mint || detailBody.data.launch.mint === mint)
    ? detailBody?.data?.launch : undefined;
  const rewards = await getRewards(mint, row.mode, num(row.transferFee?.bps), row.quote);
  const { rows, pairCoverageComplete, pairComparisonReady, ...quoteContext } = pairContext;
  const creator = launch?.creator || row.creator;

  return {
    creator: typeof creator === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(creator) ? creator : undefined,
    catalogue: { rows, pairCoverageComplete, pairComparisonReady },
    token: {
      name: row.name || launch?.name,
      symbol: row.symbol || launch?.symbol,
      image: row.imageUrl || launch?.logoUrl,
    },
    quote: {
      mint: row.quote?.mint || launch?.quote?.mint || quoteMint,
      name: row.quote?.name,
      symbol: row.quote?.symbol || launch?.quote?.symbol,
      image: row.quote?.logoUrl,
      category: row.quote?.category,
      ...quoteContext,
    },
    pair: {
      valuationSource: "stonk",
      priceUsd: num(row.market?.priceUsd),
      marketCap: num(row.market?.marketCapUsd),
      fdv: num(row.market?.fdvUsd),
      liquidityUsd: num(row.market?.liquidityUsd),
      volume24h: num(row.market?.volume24hUsd),
      priceChange24h: num(row.market?.priceChange24h),
    },
    rewards,
    stonk: {
      status: row.status,
      graduationProgress: num(row.graduationProgress),
      graduatedAt: row.graduatedAt,
      officialPeakMarketCap: num(row.market?.peakMarketCapUsd),
      startMarketCap: num(launch?.startMarketCapUsd),
      launchpad: row.launchpad || launch?.launchpad,
      mode: row.mode || launch?.mode,
    },
  };
}

export async function listStonkTokens(sort: "newest" | "volume" | "marketCap", page: number, pageSize = 100): Promise<StonkTokenRow[]> {
  const body = await getJson(`/tokens?sort=${sort}&page=${page}&pageSize=${pageSize}`);
  return Array.isArray(body?.data?.tokens) ? body.data.tokens : [];
}

export type StonkPairLaunchFeed = { rows: StonkTokenRow[]; total?: number };

async function pairLaunchPage(quoteMint: string, page: number, pageSize = 100): Promise<StonkPairLaunchFeed> {
  const body = await getJson(`/tokens?quoteMint=${encodeURIComponent(quoteMint)}&sort=newest&page=${page}&pageSize=${pageSize}`);
  if (!Array.isArray(body?.data?.tokens)) throw new Error("Stonk pair launch feed unavailable");
  return { rows: body.data.tokens, total: num(body?.data?.pagination?.total) };
}

export async function getPairLaunchFeed(quoteMint: string, pageSize = 100): Promise<StonkPairLaunchFeed> {
  return pairLaunchPage(quoteMint, 1, pageSize);
}

export async function listPairLaunches(quoteMint: string, pageSize = 100): Promise<StonkTokenRow[]> {
  return (await getPairLaunchFeed(quoteMint, pageSize)).rows;
}

export function firstPairLaunchesFromRows(rows: StonkTokenRow[], since: number, limit = 3): StonkTokenRow[] {
  const unique = [...new Map(rows.map(row => [row.mint, row])).values()];
  const newestOrder = new Map(unique.map((row, index) => [row.mint, index]));
  return unique
    .filter(row => row.mint && Number.isFinite(Date.parse(row.createdAt || ""))
      && Date.parse(row.createdAt || "") >= since)
    .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || "")
      // API sort=newest is descending. For exact timestamp ties, reverse the
      // feed's stable order instead of inventing an alphabetical mint order.
      || (newestOrder.get(b.mint)! - newestOrder.get(a.mint)!))
    .slice(0, limit);
}

// Historical/recovery helper. Because the public feed is sorted newest-first,
// the last page contains the earliest launches. For fresh main pairs this also
// guards against a burst large enough to push #1-#3 off page 1 before a poll.
export async function listFirstPairLaunchesSince(quoteMint: string, since: number, limit = 3): Promise<StonkTokenRow[]> {
  const first = await pairLaunchPage(quoteMint, 1, 100);
  if ((first.total ?? first.rows.length) <= first.rows.length) {
    return firstPairLaunchesFromRows(first.rows, since, limit);
  }
  const total = first.total!;
  const lastPage = Math.max(1, Math.ceil(total / 100));
  // /tokens?sort=newest is canonical newest-first. To reconstruct the true
  // oldest-first feed across page boundaries, read oldest pages first and
  // reverse the rows inside each page. Sorting tied timestamps afterwards
  // would destroy the server's stable feed order.
  const pages: StonkTokenRow[][] = [];
  const oldestFirst = () => {
    const seen = new Set<string>();
    const out: StonkTokenRow[] = [];
    for (const batch of pages) {
      for (const row of [...batch].reverse()) {
        if (!row.mint || seen.has(row.mint)) continue;
        const created = Date.parse(row.createdAt || "");
        if (!Number.isFinite(created) || created < since) continue;
        seen.add(row.mint);
        out.push(row);
      }
    }
    return out;
  };
  for (let page = lastPage; page >= Math.max(1, lastPage - 4); page--) {
    const batch = await pairLaunchPage(quoteMint, page, 100);
    pages.push(batch.rows);
    const ranked = oldestFirst();
    if (ranked.length >= limit || batch.rows.some(row => Date.parse(row.createdAt || "") < since)) {
      return ranked.slice(0, limit);
    }
  }
  return oldestFirst().slice(0, limit);
}

let catalogueCache: { expiresAt: number; promise: Promise<StonkTokenRow[]> } | undefined;
export function recentConceptCatalogue(): Promise<StonkTokenRow[]> {
  if (!catalogueCache || catalogueCache.expiresAt < Date.now()) {
    catalogueCache = { expiresAt: Date.now() + 120_000,
      promise: Promise.all([listStonkTokens("newest", 1), listStonkTokens("volume", 1)])
        .then(pages => pages.flat()).catch(() => []) };
  }
  return catalogueCache.promise;
}

export async function listRecentLaunches(since: number): Promise<StonkTokenRow[]> {
  const rows: StonkTokenRow[] = [];
  const configured = Number(process.env.STONK_LAUNCH_SCAN_MAX_PAGES || 5);
  const maxPages = Number.isFinite(configured) ? Math.max(1, Math.min(10, Math.floor(configured))) : 5;
  for (let page = 1; page <= maxPages; page++) {
    const body = await getJson(`/tokens?sort=newest&page=${page}&pageSize=100`);
    if (!Array.isArray(body?.data?.tokens)) {
      // Page 1 is the live source of truth. A later-page failure should not
      // turn a usable live scan into a total outage.
      if (rows.length) return rows;
      throw new Error("Stonk launch feed unavailable");
    }
    const batch: StonkTokenRow[] = body.data.tokens;
    rows.push(...batch);
    if (batch.length < 100 || batch.some(row => Date.parse(row.createdAt || "") < since)) return rows;
  }
  // Keep the radar live instead of pinning it to an hours-old backlog. Missed
  // older breakouts are recovered by the 30-minute BUILD/REAWAKENING discovery.
  return rows;
}

export function stonkRowToLaunch(row: StonkTokenRow): Launch | undefined {
  const quoteMint = row.quote?.mint;
  const launchedAt = row.createdAt ? Date.parse(row.createdAt) : NaN;
  if (!row.mint || !row.pool || !quoteMint || !Number.isFinite(launchedAt)) return undefined;

  return {
    signature: `stonk-api:${row.mint}`,
    launchedAt,
    creator: row.creator,
    platformConfig: row.mode === "reward" ? STONK_REWARD_CONFIG : STONK_STANDARD_CONFIG,
    poolState: row.pool,
    mint: row.mint,
    quoteMint,
    source: "stonk-api",
  };
}
