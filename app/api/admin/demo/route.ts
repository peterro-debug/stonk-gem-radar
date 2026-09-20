import { NextRequest, NextResponse } from "next/server";
import { analyzeLaunch } from "@/lib/analyze";
import { chooseDemoCandidate, summarizeDemo } from "@/lib/demo";
import { formatAlert } from "@/lib/format";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.RADAR_ADMIN_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown demo error";
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const selected = await chooseDemoCandidate();
    const snapshot = await analyzeLaunch(selected.launch);
    const telegramPreview = formatAlert(snapshot, { demo: true });

    await sendTelegram(telegramPreview, snapshot.launch.mint);

    return NextResponse.json({
      ok: true,
      demo: true,
      noTrade: true,
      persistentMonitorStarted: false,
      selectedBy: {
        selection: selected.selection,
        mode: selected.mode,
        priority: selected.priority,
        reason: selected.reason,
      },
      queriedSources: [
        "StonkFun public API — launch, pair and reward context",
        "DEX Screener — price, volume, liquidity and buy/sell flow",
        "Helius — token metadata and holder distribution",
        "RugCheck — graph and wallet-risk evidence",
        ...(process.env.GMGN_API_KEY ? ["GMGN — wallet classifications, balances, funding origins and creation timestamps"] : []),
      ],
      analysis: summarizeDemo(snapshot),
      telegram: {
        sent: true,
        preview: telegramPreview,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, demo: true, error: safeError(error) }, { status: 502 });
  }
}
