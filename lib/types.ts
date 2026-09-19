export type Launch = {
  signature: string;
  launchedAt: number;
  creator?: string;
  platformConfig: string;
  poolState: string;
  mint: string;
  quoteMint: string;
  baseVault?: string;
  quoteVault?: string;
};

export type PairMetrics = {
  pairAddress?: string;
  dexId?: string;
  priceUsd?: number;
  marketCap?: number;
  fdv?: number;
  liquidityUsd?: number;
  volume5m?: number;
  volume1h?: number;
  volume24h?: number;
  buys5m?: number;
  sells5m?: number;
  buys1h?: number;
  sells1h?: number;
  pairCreatedAt?: number;
};

export type HolderMetrics = {
  holders: number;
  top10Pct?: number;
  largestPct?: number;
  creatorPct?: number;
};

export type TraderMetrics = {
  uniqueBuyers?: number;
  uniqueSellers?: number;
  uniqueTraders?: number;
  sampledSwaps?: number;
};

export type TokenMeta = {
  name?: string;
  symbol?: string;
  image?: string;
  decimals?: number;
};

export type QuoteMeta = TokenMeta & { mint: string; isNewPair?: boolean; category?: string };

export type Snapshot = {
  checkedAt: number;
  ageMinutes: number;
  launch: Launch;
  token: TokenMeta;
  quote: QuoteMeta;
  pair: PairMetrics;
  holders: HolderMetrics;
  traders: TraderMetrics;
  narrativeScore: number;
  narrativeReason: string;
  peakMarketCap?: number;
  retention?: number;
  score: number;
  status: "FLASH" | "EARLY WATCH" | "GEM" | "RECLAIM" | "SKIP" | "NO SIGNAL";
  reasons: string[];
  risks: string[];
};
