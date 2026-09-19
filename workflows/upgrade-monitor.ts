import { createHook, sleep, RetryableError } from "workflow";
import { getRun, start } from "workflow/api";
import { captureLaunchState, outdatedLaunchRuns } from "@/lib/monitor-upgrade";
import type { Launch, LaunchMonitorSeed } from "@/lib/types";
import { launchWorkflow } from "./launch-workflow";

async function capture(runId: string) {
  "use step";
  const saved = await captureLaunchState(runId);
  if (saved === "busy") throw new RetryableError("Waiting for an active analysis/delivery before upgrade", { retryAfter: "10s" });
  return saved;
}
capture.maxRetries = 20;

async function retire(runId: string) {
  "use step";
  const run = getRun(runId);
  const status = await run.status;
  if (status === "running" || status === "pending") await run.cancel();
}

async function replace(runId: string, launch: Launch, seed: LaunchMonitorSeed) {
  "use step";
  const next = await start(launchWorkflow, [launch, seed, runId]);
  return next.runId;
}
replace.maxRetries = 20;

// Persist the full previous state before cancelling the old deployment's run.
// Failed replacement requests retry from this saved state, preserving risk warnings.
export async function upgradeMonitorWorkflow(runId: string) {
  "use workflow";
  const lock = createHook({ token: `stonk-upgrade:${runId}` });
  const conflict = await lock.getConflict();
  if (conflict) return { dedupedTo: conflict.runId };
  try {
    const saved = await capture(runId);
    if (saved === "finished") return { skipped: true };
    await retire(runId);
    await sleep("2s");
    const nextRunId = await replace(runId, saved.launch, saved.seed);
    return { previousRunId: runId, nextRunId, mint: saved.launch.mint };
  } finally { lock.dispose(); }
}

async function listLegacy() {
  "use step";
  return outdatedLaunchRuns();
}

async function enqueueUpgrade(runId: string) {
  "use step";
  const run = await start(upgradeMonitorWorkflow, [runId]);
  return run.runId;
}

export async function upgradeAllMonitorsWorkflow() {
  "use workflow";
  const lock = createHook({ token: "stonk-upgrade-all" });
  const conflict = await lock.getConflict();
  if (conflict) return { dedupedTo: conflict.runId };
  try {
    const old = await listLegacy();
    const upgrades: string[] = [];
    for (const runId of old) upgrades.push(await enqueueUpgrade(runId));
    return { total: old.length, upgrades };
  } finally { lock.dispose(); }
}
