import { DAY, HOUR, MAX_TRACK_AGE_MS } from "./constants";
import { listStonkTokens, stonkRowToLaunch, type StonkTokenRow } from "./stonk";
import type { Launch, ScanMode } from "./types";

export type DiscoveryCandidate = {
  launch: Launch;
  mode: ScanMode;
  priority: number;
  reason: string;
};

function value(row: StonkTokenRow, key: keyof NonNullable<StonkTokenRow["market"]>): number {
  const parsed = Number(row.market?.[key]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectDiscoveryCandidates(
  newest: StonkTokenRow[],
  volumeLeaders: StonkTokenRow[],
  now = Date.now(),
): DiscoveryCandidate[] {
  const selected = new Map<string, DiscoveryCandidate>();

  const consider = (row: StonkTokenRow, source: "newest" | "volume") => {
    const launch = stonkRowToLaunch(row);
    if (!launch) return;
    const age = now - launch.launchedAt;
    if (age < 0 || age > MAX_TRACK_AGE_MS) return;

    const mc = value(row, "marketCapUsd") || value(row, "fdvUsd");
    const vol = value(row, "volume24hUsd");
    const change24h = value(row, "priceChange24h");
    const rotation = mc > 0 ? vol / mc : 0;
    if (mc < 5_000 || mc > 10_000_000) return;

    let mode: ScanMode;
    let qualifies = false;
    let reason = "";
    if (age <= 6 * HOUR) {
      mode = "FLASH";
      qualifies = source === "newest" && (vol >= 10_000 || rotation >= 0.2 || change24h >= 35);
      reason = "fresh launch with early velocity";
    } else if (age < 3 * DAY) {
      mode = "BUILD";
      qualifies = vol >= 35_000 && (rotation >= 0.12 || change24h >= 20);
      reason = "post-launch build with sustained activity";
    } else {
      mode = "REAWAKENING";
      qualifies = source === "volume" && vol >= 75_000 && (rotation >= 0.15 || change24h >= 30);
      reason = "3–21 day token with renewed volume/price acceleration";
    }
    if (!qualifies) return;

    const priority = Math.round(
      (mode === "REAWAKENING" ? 30 : mode === "BUILD" ? 20 : 10)
      + Math.min(30, rotation * 30)
      + Math.min(30, Math.max(0, change24h) / 4)
      + (row.mode === "reward" ? 8 : 0),
    );
    const existing = selected.get(row.mint);
    if (!existing || priority > existing.priority) {
      selected.set(row.mint, { launch, mode, priority, reason });
    }
  };

  newest.forEach((row) => consider(row, "newest"));
  volumeLeaders.forEach((row) => consider(row, "volume"));
  return [...selected.values()].sort((a, b) => b.priority - a.priority);
}

export async function discoverCandidates(): Promise<DiscoveryCandidate[]> {
  const [newest1, newest2, volume1, volume2] = await Promise.all([
    listStonkTokens("newest", 1),
    listStonkTokens("newest", 2),
    listStonkTokens("volume", 1),
    listStonkTokens("volume", 2),
  ]);
  return selectDiscoveryCandidates([...newest1, ...newest2], [...volume1, ...volume2]);
}
