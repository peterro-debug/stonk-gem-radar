import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { discoverCandidates } from "@/lib/discovery";
import { launchWorkflow } from "@/workflows/launch-workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secrets = [process.env.CRON_SECRET, process.env.RADAR_ADMIN_SECRET].filter(Boolean);
  if (!secrets.length) return process.env.NODE_ENV !== "production";
  const authorization = req.headers.get("authorization");
  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

async function runDiscovery(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const candidates = await discoverCandidates();
  const configuredLimit = Number(process.env.DISCOVERY_MAX_STARTS || 25);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(100, configuredLimit)) : 25;
  const selected = candidates.slice(0, limit);
  const started: Array<{ mint: string; mode: string; priority: number; runId: string }> = [];

  // Keep enqueue pressure predictable. Per-mint workflow hooks dedupe candidates
  // that are also seen by Helius or a previous discovery pass.
  for (const candidate of selected) {
    const run = await start(launchWorkflow, [candidate.launch]);
    started.push({
      mint: candidate.launch.mint,
      mode: candidate.mode,
      priority: candidate.priority,
      runId: run.runId,
    });
  }

  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    candidates: candidates.length,
    started: started.length,
    runs: started,
  });
}

export const GET = runDiscovery;
export const POST = runDiscovery;
