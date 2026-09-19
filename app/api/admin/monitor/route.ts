import { NextRequest, NextResponse } from "next/server";
import { ensurePairMonitor } from "@/lib/ensure-pair-monitor";
import { pairMonitorStatus } from "@/lib/pair-monitor-status";
import { xConfigured } from "@/lib/x-feed";
import { outdatedLaunchRuns } from "@/lib/monitor-upgrade";
import { start } from "workflow/api";
import { upgradeAllMonitorsWorkflow } from "@/workflows/upgrade-monitor";
import { ALERT_POLICY_VERSION } from "@/lib/alert-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  return Boolean(process.env.RADAR_ADMIN_SECRET && req.headers.get("authorization") === `Bearer ${process.env.RADAR_ADMIN_SECRET}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, policy: ALERT_POLICY_VERSION, xConfigured: xConfigured(),
      legacyLaunchRunsRemaining: (await outdatedLaunchRuns()).length, monitor: await pairMonitorStatus() });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read pair monitor state" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const upgrade = await start(upgradeAllMonitorsWorkflow, []);
    return NextResponse.json({ ok: true, policy: ALERT_POLICY_VERSION, xConfigured: xConfigured(),
      upgradeRunId: upgrade.runId, monitor: await ensurePairMonitor() });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not start pair monitor" }, { status: 503 });
  }
}
