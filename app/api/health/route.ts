import { NextResponse } from "next/server";
import { pairMonitorStatus } from "@/lib/pair-monitor-status";
import { xConfigured } from "@/lib/x-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  let sources: Record<string, unknown>;
  try {
    const monitor = await pairMonitorStatus();
    sources = {
      pairMonitor: monitor.status,
      stateError: monitor.stateError,
      checkedAt: monitor.state?.checkedAt,
      registryLastSuccessAt: monitor.state?.registryLastSuccessAt,
      registryError: monitor.state?.registryError,
      launchesLastSuccessAt: monitor.state?.launchesLastSuccessAt,
      launchesError: monitor.state?.launchesError,
      notificationError: monitor.state?.notificationError,
      x: monitor.state?.x.status || (xConfigured() ? "not-checked" : "not-configured"),
      xLastSuccessAt: monitor.state?.x.lastSuccessAt,
      xError: monitor.state?.x.error,
    };
  } catch { sources = { pairMonitor: "status-unavailable", x: xConfigured() ? "not-checked" : "not-configured" }; }
  return NextResponse.json({
    ok: true,
    revision: process.env.VERCEL_GIT_COMMIT_SHA,
    sources,
    configured: {
      helius: Boolean(process.env.HELIUS_API_KEY),
      webhookAuth: Boolean(process.env.HELIUS_WEBHOOK_AUTH_SECRET),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      cronAuth: Boolean(process.env.CRON_SECRET || process.env.RADAR_ADMIN_SECRET),
      specialistWalletRisk: Boolean(process.env.WALLET_RISK_API_URL),
      x: xConfigured(),
    },
    walletPolicy: "UNKNOWN is never CLEAN and cannot trigger GEM",
    scanModes: ["FLASH", "BUILD", "REAWAKENING"],
    nameMatching: "explainable aliases and associations; no universal semantic coverage",
  });
}
