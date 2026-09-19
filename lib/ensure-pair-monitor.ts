import { start } from "workflow/api";
import { pairMonitorWorkflow } from "@/workflows/pair-monitor";
import { pairMonitorStatus } from "./pair-monitor-status";

export async function ensurePairMonitor() {
  const current = await pairMonitorStatus();
  if (current.status !== "not-running") return { status: current.status, runId: current.runId };
  const run = await start(pairMonitorWorkflow, []);
  return { status: "starting", runId: run.runId };
}
