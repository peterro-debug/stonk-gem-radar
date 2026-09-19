export const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
export const STONK_REWARD_CONFIG = "6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt";
export const STONK_STANDARD_CONFIG = "4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7";
export const STONK_CONFIGS = new Set([STONK_REWARD_CONFIG, STONK_STANDARD_CONFIG]);
export const RAYDIUM_CPMM = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const MAX_TRACK_AGE_MS = 21 * DAY;

// Absolute ages, not relative delays. Backfilled tokens skip checkpoints that
// are already in the past and enter BUILD/REAWAKENING immediately.
export const CHECKPOINT_AGES_MS = [
  20_000,
  3 * MINUTE,
  7 * MINUTE,
  12 * MINUTE,
  20 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  3 * DAY,
  4 * DAY,
  5 * DAY,
  7 * DAY,
  10 * DAY,
  14 * DAY,
  18 * DAY,
  21 * DAY,
] as const;

export const WALLET_LIMITS = {
  bundledSupplyPct: 8,
  sniperSupplyPct: 12,
  commonFunderSupplyPct: 8,
  freshWalletSupplyPct: 20,
  insiderSupplyPct: 8,
  graphInsiderWallets: 20,
} as const;

export function modeForAge(ageMinutes: number): import("./types").ScanMode {
  if (ageMinutes <= 6 * 60) return "FLASH";
  if (ageMinutes < 3 * 24 * 60) return "BUILD";
  return "REAWAKENING";
}
