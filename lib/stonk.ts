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
};

function recentPairMints(): Set<string> {
  return new Set(
    (process.env.RECENT_PAIR_MINTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

async function getPairLaunchContext(quoteMint: string, mint: string): Promise<Pick<QuoteMeta, "launchCount" | "launchRank" | "isFirstMover" | "isNewPair">> {
  const manualEvent = recentPairMints().has(quoteMint);
  const body = await getJson(`/tokens?quoteMint=${encodeURIComponent(quoteMint)}&sort=newest&page=1&pageSize=100`);
  const rows: StonkTokenRow[] = body?.data?.tokens || [];
  const launchCount = num(body?.data?.pagination?.total);

  let launchRank: number | undefined;
  if (launchCount != null && launchCount <= 100) {
    const unique = [...new Map(rows.map((row) => [row.mint, row])).values()]
      .filter((row) => row.createdAt)
      .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
    const index = unique.findIndex((row) => row.mint === mint);
    if (index >= 0) launchRank = index + 1;
  }

  const isFirstMover = launchRank != null && launchRank <= 3;
  return {
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

  const row: StonkTokenRow = detailBody?.data?.token || {} as StonkTokenRow;
  const launch = detailBody?.data?.launch;
  const rewards = await getRewards(mint, row.mode, num(row.transferFee?.bps), row.quote);

  return {
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
      ...pairContext,
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

export async function listRecentLaunches(since: number): Promise<StonkTokenRow[]> {
  const rows: StonkTokenRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const body = await getJson(`/tokens?sort=newest&page=${page}&pageSize=100`);
    if (!Array.isArray(body?.data?.tokens)) throw new Error("Stonk launch feed unavailable");
    const batch: StonkTokenRow[] = body.data.tokens;
    rows.push(...batch);
    if (batch.length < 100 || batch.some(row => Date.parse(row.createdAt || "") < since)) return rows;
  }
  // Don't silently advance the cursor through an unobserved burst of launches.
  throw new Error("Stonk launch feed exceeds 500-row scan window");
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
