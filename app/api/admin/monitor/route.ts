import { NextRequest, NextResponse } from "next/server";
import { ensurePairMonitor } from "@/lib/ensure-pair-monitor";
import { pairMonitorStatus } from "@/lib/pair-monitor-status";
import { xConfigured } from "@/lib/x-feed";

export const runtime = "nodejs";
export const maxDuration = 30;

function authorized(req: NextRequest) {
  return Boolean(process.env.RADAR_ADMIN_SECRET && req.headers.get("authorization") === `Bearer ${process.env.RADAR_ADMIN_SECRET}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, xConfigured: xConfigured(), monitor: await pairMonitorStatus() });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read pair monitor state" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, xConfigured: xConfigured(), monitor: await ensurePairMonitor() });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not start pair monitor" }, { status: 503 });
  }
}
