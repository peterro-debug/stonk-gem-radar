import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { parseStonkLaunches } from "@/lib/parse-launch";
import { launchWorkflow } from "@/workflows/launch-workflow";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expected = process.env.HELIUS_WEBHOOK_AUTH_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "webhook auth is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json();
  const launches = parseStonkLaunches(payload);
  const runIds: string[] = [];

  for (const launch of launches) {
    const run = await start(launchWorkflow, [launch]);
    runIds.push(run.runId);
  }

  return NextResponse.json({ received: true, launches: launches.length, runIds });
}
