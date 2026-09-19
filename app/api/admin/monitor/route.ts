import { NextRequest, NextResponse } from "next/server";
import { ensurePairMonitor } from "@/lib/ensure-pair-monitor";
import { pairMonitorStatus } from "@/lib/pair-monitor-status";
import { xConfigured } from "@/lib/x-feed";
import { outdatedLaunchRuns } from "@/lib/monitor-upgrade";
import { start } from "workflow/api";
import { upgradeMonitorWorkflow } from "@/workflows/upgrade-monitor";
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
    const old = await outdatedLaunchRuns();
    const upgrades = [];
    for (const runId of old.slice(0, 25)) {
      const run = await start(upgradeMonitorWorkflow, [runId]);
      upgrades.push({ previousRunId: runId, upgradeRunId: run.runId });
    }
    return NextResponse.json({ ok: true, policy: ALERT_POLICY_VERSION, xConfigured: xConfigured(),
      upgrades, remainingToQueue: Math.max(0, old.length - upgrades.length), monitor: await ensurePairMonitor() });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not start pair monitor" }, { status: 503 });
  }
}
