export type ScanMode = "FLASH" | "BUILD" | "REAWAKENING";

export type SignalStatus =
  | "NO SIGNAL"
  | "FLASH"
  | "EARLY WATCH"
  | "BUILD WATCH"
  | "REAWAKENING"
  | "RECLAIM"
  | "GEM"
  | "INVALIDATED"
  | "SKIP";

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
  source?: "helius" | "stonk-api" | "manual";
  pairEvent?: PairEvent;
};

export type PairEvent = {
  quoteMint: string;
  detectedAt: number;
  source: "stonk-registry" | "x-announcement";
  sourceUrl: string;
  description: string;
};

export type PairMetrics = {
  checkedAt?: number;
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
  buys24h?: number;
  sells24h?: number;
  priceChange5m?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  pairCreatedAt?: number;
  valuationSource?: "dex-base" | "stonk";
  valuationPairAddress?: string;
  flowReversed?: boolean;
};

export type HolderMetrics = {
  checkedAt?: number;
  holders: number;
  top10Pct?: number;
  largestPct?: number;
  creatorPct?: number;
  excludedPoolAccounts?: number;
  sampleComplete?: boolean;
  sampledAccounts?: number;
  poolExclusionKnown?: boolean;
};

export type TraderMetrics = {
  checkedAt?: number;
  windowMinutes?: number;
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

export type QuoteMeta = TokenMeta & {
  mint: string;
  category?: string;
  launchCount?: number;
  launchRank?: number;
  isFirstMover?: boolean;
  isNewPair?: boolean;
  event?: PairEvent;
};

export type RewardMetrics = {
  mode?: "reward" | "standard" | string;
  transferFeeBps?: number;
  rewardMint?: string;
  rewardSymbol?: string;
  distributedTokens?: number;
  undistributedTokens?: number;
  payoutCount?: number;
  rewardedHolders?: number;
  lastPayoutAt?: string;
  nativeQuoteReward: boolean;
};

export type StonkMetrics = {
  status?: string;
  graduationProgress?: number;
  graduatedAt?: string;
  officialPeakMarketCap?: number;
  startMarketCap?: number;
  launchpad?: string;
  mode?: string;
};

export type WalletVerification = "CLEAN" | "RISKY" | "UNKNOWN";

export type WalletRiskMetrics = {
  verification: WalletVerification;
  provider: string;
  checkedAt: number;
  graphChecked: boolean;
  bundleChecked: boolean;
  sniperChecked: boolean;
  fundingChecked: boolean;
  rugged?: boolean;
  rugcheckScore?: number;
  graphInsiderWallets?: number;
  insiderSupplyPct?: number;
  bundledSupplyPct?: number;
  sniperSupplyPct?: number;
  commonFunderSupplyPct?: number;
  freshWalletSupplyPct?: number;
  mintAuthorityRevoked?: boolean;
  freezeAuthorityRevoked?: boolean;
  flags: string[];
  excludedTokenAccounts: string[];
  initialBundledSupplyPct?: number;
  trackerStatus?: string;
  trackerError?: string;
  trackerRiskScore?: number;
};

export type NarrativeMetrics = {
  score: number;
  reason: string;
  pairFit: boolean;
  mascotFit: boolean;
  rewardFit: boolean;
  firstMoverFit: boolean;
  method?: "rules";
};

export type TrendMetrics = {
  holderGrowthPct?: number;
  uniqueBuyerGrowthPct?: number;
  marketCapChangePct?: number;
  liquidityGrowthPct?: number;
  volume1hAcceleration?: number;
  volume24hAcceleration?: number;
  recoveryFromLowPct?: number;
  reawakeningSignals: string[];
};

export type Snapshot = {
  checkedAt: number;
  ageMinutes: number;
  mode: ScanMode;
  launch: Launch;
  token: TokenMeta;
  quote: QuoteMeta;
  pair: PairMetrics;
  holders: HolderMetrics;
  traders: TraderMetrics;
  rewards: RewardMetrics;
  stonk: StonkMetrics;
  wallet: WalletRiskMetrics;
  narrative: NarrativeMetrics;
  trend: TrendMetrics;
  peakMarketCap?: number;
  lowMarketCap?: number;
  retention?: number;
  score: number;
  status: SignalStatus;
  reasons: string[];
  risks: string[];
};

export type AnalysisContext = {
  previous?: Snapshot;
  peakMarketCap?: number;
  lowMarketCap?: number;
  everAlerted?: boolean;
};

export type LaunchMonitorSeed = AnalysisContext & {
  lastNotified?: SignalStatus;
  candidateNotified?: boolean;
  checks?: number;
};

export type RadarRunResult = {
  mint: string;
  lastStatus: SignalStatus;
  peakMarketCap?: number;
  lowMarketCap?: number;
  checks: number;
  dedupedTo?: string;
  stoppedReason?: string;
};
