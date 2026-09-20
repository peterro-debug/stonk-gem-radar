import { NextResponse } from "next/server";
import { listFirstPairLaunchesSince, getPairLaunchFeed } from "@/lib/stonk";
import { emptyMonitorState, observePairs } from "@/lib/pair-events";

export const dynamic = "force-dynamic";

const CASES = [
  { label: "PEPE", mint: "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m" },
  { label: "BLACKBERRY", mint: "BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy" },
] as const;

export async function GET() {
  const now = Date.now();
  const out = [];
  for (const c of CASES) {
    const [feed, first] = await Promise.all([
      getPairLaunchFeed(c.mint),
      listFirstPairLaunchesSince(c.mint, 0, 3),
    ]);
    const baseline = observePairs(emptyMonitorState(), [], now - 60_000).state;
    const observed = observePairs(baseline, [{ mint: c.mint, name: c.label, symbol: c.label }], now);
    out.push({
      label: c.label,
      quoteMint: c.mint,
      registryEventDetected: observed.added.length === 1 && observed.added[0].quoteMint === c.mint,
      totalLaunches: feed.total,
      firstThree: first.map((row, i) => ({
        rank: i + 1,
        mint: row.mint,
        name: row.name,
        symbol: row.symbol,
        createdAt: row.createdAt,
        quoteMint: row.quote?.mint,
        quoteMatches: row.quote?.mint === c.mint,
      })),
    });
  }
  return NextResponse.json({ ok: true, testedAt: new Date(now).toISOString(), cases: out });
}
