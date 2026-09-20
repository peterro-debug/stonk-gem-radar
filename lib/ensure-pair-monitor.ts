import { getRun, start } from "workflow/api";
import { pairMonitorWorkflow } from "@/workflows/pair-monitor";
import { pairMonitorStatus } from "./pair-monitor-status";

export async function ensurePairMonitor() {
  const current = await pairMonitorStatus();
  if ((current.status === "stale" || current.deploymentOutdated) && current.state && current.runId) {
    // Persist the cursor in the successor's input before cancelling the stale run.
    // Its predecessor-aware lock waits until the previous run releases ownership.
    const next = await start(pairMonitorWorkflow, [current.state, current.runId]);
    const old = getRun(current.runId);
    const status = await old.status;
    if (status === "running" || status === "pending") await old.cancel();
    return { status: "restarting", runId: next.runId, previousRunId: current.runId };
  }
  if (current.status !== "not-running") return { status: current.status, runId: current.runId };
  const run = await start(pairMonitorWorkflow, []);
  return { status: "starting", runId: run.runId };
}
