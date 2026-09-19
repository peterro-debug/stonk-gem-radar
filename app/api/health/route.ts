import { NextResponse } from "next/server";
import { pairMonitorStatus } from "@/lib/pair-monitor-status";
import { xConfigured } from "@/lib/x-feed";
import { ALERT_POLICY_VERSION, MIN_NARRATIVE_SCORE, MIN_ALERT_LIQUIDITY_USD } from "@/lib/alert-policy";
import { outdatedLaunchRuns } from "@/lib/monitor-upgrade";

export const dynamic = "force-dynamic";

export async function GET() {
  let sources: Record<string, unknown>;
  try {
    const monitor = await pairMonitorStatus();
    sources = {
      pairMonitor: monitor.status,
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
  let legacyLaunchRunsRemaining: number | "unavailable";
  try { legacyLaunchRunsRemaining = (await outdatedLaunchRuns()).length; }
  catch { legacyLaunchRunsRemaining = "unavailable"; }
  return NextResponse.json({
    ok: true,
    revision: process.env.VERCEL_GIT_COMMIT_SHA,
    sources,
    legacyLaunchRunsRemaining,
    configured: {
      helius: Boolean(process.env.HELIUS_API_KEY),
      webhookAuth: Boolean(process.env.HELIUS_WEBHOOK_AUTH_SECRET),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      cronAuth: Boolean(process.env.CRON_SECRET || process.env.RADAR_ADMIN_SECRET),
      specialistWalletRisk: Boolean(process.env.WALLET_RISK_API_URL),
      solanaTracker: Boolean(process.env.SOLANA_TRACKER_API_KEY),
      x: xConfigured(),
    },
    walletPolicy: "All positive alerts require complete, fresh evidence; UNKNOWN waits. Previous-alert risk warnings remain enabled.",
    alertPolicy: { version: ALERT_POLICY_VERSION, minimumNarrative: MIN_NARRATIVE_SCORE,
      requirePairFit: true, minimumLiquidityUsd: MIN_ALERT_LIQUIDITY_USD,
      required: ["insider graph", "bundles", "snipers", "common funders", "fresh wallets", "authorities", "holders", "market data", "on-chain buyers"],
      fundingProviderConfigured: Boolean(process.env.WALLET_RISK_API_URL),
      missingProviderConfiguration: [!process.env.SOLANA_TRACKER_API_KEY && "SOLANA_TRACKER_API_KEY",
        !process.env.WALLET_RISK_API_URL && "common-funder and fresh-wallet evidence provider"].filter(Boolean) },
    scanModes: ["FLASH", "BUILD", "REAWAKENING"],
    nameMatching: "explainable aliases and associations; no universal semantic coverage",
  });
}
