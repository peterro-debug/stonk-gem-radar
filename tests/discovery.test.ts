import { describe, expect, it } from "vitest";
import { selectDiscoveryCandidates } from "@/lib/discovery";
import type { StonkTokenRow } from "@/lib/stonk";

const NOW = Date.parse("2026-09-19T14:30:00.000Z");

function row(overrides: Partial<StonkTokenRow>): StonkTokenRow {
  return {
    mint: "mint",
    pool: "pool",
    name: "Token",
    symbol: "TOKEN",
    creator: "creator",
    quote: { mint: "quote", symbol: "JUP", name: "Jupiter" },
    mode: "reward",
    createdAt: "2026-09-19T14:00:00.000Z",
    market: { marketCapUsd: 100_000, volume24hUsd: 40_000, priceChange24h: 40 },
    ...overrides,
  };
}

describe("three-mode discovery", () => {
  it("finds a fresh launch and a 13-day JUPCAT-style second wave", () => {
    const fresh = row({ mint: "fresh", pool: "fresh-pool" });
    const jupcat = row({
      mint: "jupcat",
      pool: "jupcat-pool",
      name: "Jupiter Cat",
      symbol: "JUPCAT",
      createdAt: "2026-09-06T08:50:40.264Z",
      market: { marketCapUsd: 1_204_708, volume24hUsd: 309_584, priceChange24h: 123.2 },
    });
    const candidates = selectDiscoveryCandidates([fresh], [jupcat], NOW);
    expect(candidates.map((candidate) => [candidate.launch.mint, candidate.mode])).toEqual(expect.arrayContaining([
      ["fresh", "FLASH"],
      ["jupcat", "REAWAKENING"],
    ]));
  });

  it("does not surface old low-activity noise", () => {
    const noise = row({
      mint: "noise",
      pool: "noise-pool",
      createdAt: "2026-09-08T10:00:00.000Z",
      market: { marketCapUsd: 90_000, volume24hUsd: 3_000, priceChange24h: -12 },
    });
    expect(selectDiscoveryCandidates([], [noise], NOW)).toHaveLength(0);
  });
});
