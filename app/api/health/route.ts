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
      pairMonitorDeploymentOutdated: monitor.deploymentOutdated,
      checkedAt: monitor.state?.checkedAt,
      registryLastSuccessAt: monitor.state?.registryLastSuccessAt,
      registryError: monitor.state?.registryError,
      launchesLastSuccessAt: monitor.state?.launchesLastSuccessAt,
      launchesError: monitor.state?.launchesError,
      pairLaunchesLastSuccessAt: monitor.state?.pairLaunchesLastSuccessAt,
      pairLaunchesError: monitor.state?.pairLaunchesError,
      activePairLaunchWatches: Object.keys(monitor.state?.pairLaunchWatches || {}).length,
      trackedPairCohortTokens: Object.values(monitor.state?.pairLaunchWatches || {})
        .reduce((sum, watch) => sum + (watch.cohort?.length || 0), 0),
      pairMomentumAlertsSent: Object.values(monitor.state?.pairLaunchWatches || {})
        .reduce((sum, watch) => sum + Object.keys(watch.momentumNotified || {}).length, 0),
      discoveryLastSuccessAt: monitor.state?.discoveryLastSuccessAt,
      discoveryError: monitor.state?.discoveryError,
      lastStartedCount: monitor.state?.lastStartedCount,
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
      gmgn: Boolean(process.env.GMGN_API_KEY),
      x: xConfigured(),
    },
    walletPolicy: "Verified signals require complete evidence. Yellow OBSERVATION alerts allow named specialist gaps; core safety and concentration limits still apply.",
    alertPolicy: { version: ALERT_POLICY_VERSION, minimumNarrative: MIN_NARRATIVE_SCORE,
      requirePairFit: true, minimumLiquidityUsd: MIN_ALERT_LIQUIDITY_USD,
      observation: { minimumActivityScore: 70, minimumHolders: 60,
        concept: "documented pair fit >=3/5 OR catalogue originality >=3/5 with fully retrieved declared pair windows",
        permittedGaps: ["bundles", "snipers", "common funders", "fresh wallets", "on-chain buyers"],
        mandatory: ["fresh evidence", "revoked authorities", "market activity", "no known hard risk", "no detected name copy"],
        ownership: "full holder/creator and graph evidence OR disclosed partial GMGN sample",
        partialSample: { minimumWallets: 60, minimumSupplyPct: 50, maximumObservedLargestPct: 10,
          maximumObservedTop10Pct: 35, requireKnownPoolExclusions: true, verified: false } },
      required: ["insider graph", "bundles", "snipers", "common funders", "fresh wallets", "authorities", "holders", "market data", "on-chain buyers"],
      fundingProviderConfigured: Boolean(process.env.WALLET_RISK_API_URL || process.env.GMGN_API_KEY),
      missingProviderConfiguration: [!process.env.SOLANA_TRACKER_API_KEY && !process.env.GMGN_API_KEY && !process.env.WALLET_RISK_API_URL && "GMGN_API_KEY or another complete wallet evidence provider",
        !process.env.WALLET_RISK_API_URL && !process.env.GMGN_API_KEY && "common-funder and fresh-wallet evidence provider"].filter(Boolean),
      coveragePolicy: "Configured is not verified. Full wallet coverage remains mandatory for verified signals; observations disclose gaps." },
    scanModes: ["FLASH", "BUILD", "REAWAKENING"],
    nameMatching: "documented pair associations plus open-concept originality against a bounded Stonk catalogue; no claim of universal semantic understanding",
  });
}
