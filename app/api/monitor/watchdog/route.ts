import { NextRequest, NextResponse } from "next/server";
import { ensurePairMonitor } from "@/lib/ensure-pair-monitor";

export const runtime = "nodejs";
export const maxDuration = 30;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  // Vercel adds this header to Cron invocations. Without a configured secret,
  // the endpoint remains parameterless/idempotent and can only ensure the one
  // fixed pair monitor is running on the latest deployment.
  return req.headers.get("x-vercel-cron-schedule") === "*/5 * * * *";
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, monitor: await ensurePairMonitor() });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not ensure pair monitor" }, { status: 503 });
  }
}
