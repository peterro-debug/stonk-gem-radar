import { getWorld } from "workflow/runtime";
import { observabilityRevivers, parseStepName, parseWorkflowName } from "workflow/observability";
import { hydrateDataWithKey } from "@workflow/core/serialization-format";
import { importKey } from "@workflow/core/encryption";
import type { Launch, LaunchMonitorSeed, Snapshot } from "./types";
import { STONK_CONFIGS } from "./constants";

export async function outdatedLaunchRuns() {
  const world = getWorld();
  const deploymentId = await world.getDeploymentId();
  const outdated: string[] = [];
  for (const status of ["running", "pending"] as const) {
    let cursor: string | undefined;
    do {
      const page = await world.runs.list({ status, resolveData: "none", pagination: { limit: 100, cursor } });
      for (const run of page.data) {
        if (parseWorkflowName(run.workflowName)?.functionName === "launchWorkflow" && run.deploymentId !== deploymentId) outdated.push(run.runId);
      }
      cursor = page.hasMore ? page.cursor || undefined : undefined;
    } while (cursor);
  }
  return outdated;
}

export async function captureLaunchState(runId: string): Promise<{ launch: Launch; seed: LaunchMonitorSeed } | "busy" | "finished"> {
  const world = getWorld();
  const run = await world.runs.get(runId);
  if (run.status !== "running" && run.status !== "pending") return "finished";
  if (parseWorkflowName(run.workflowName)?.functionName !== "launchWorkflow") throw new Error("Only launch monitors can be upgraded");
  const rawKey = await world.getEncryptionKeyForRun?.(run);
  const key = rawKey ? await importKey(rawKey) : undefined;
  const decode = (data: unknown) => hydrateDataWithKey(data as Parameters<typeof hydrateDataWithKey>[0], observabilityRevivers, key);
  const args = await decode(run.input) as [Launch, LaunchMonitorSeed?];
  const launch = args?.[0];
  if (!launch?.mint || !STONK_CONFIGS.has(launch.platformConfig)) throw new Error("Invalid persisted Stonk launch");
  const seed: LaunchMonitorSeed = { ...args[1] };
  let cursor: string | undefined;
  const completed = [];
  do {
    const page = await world.steps.list({ runId, resolveData: "all", pagination: { limit: 100, cursor, sortOrder: "asc" } });
    // Do not cancel a request that may still be delivering a Telegram message.
    if (page.data.some(step => step.status === "running" || step.status === "pending")) return "busy";
    completed.push(...page.data.filter(step => step.status === "completed"));
    cursor = page.hasMore ? page.cursor || undefined : undefined;
  } while (cursor);
  for (const step of completed) {
    const name = parseStepName(step.stepName)?.functionName;
    if (name === "check") {
      const snapshot = await decode(step.output) as Snapshot;
      if (snapshot?.launch?.mint !== launch.mint || !Number.isFinite(snapshot.checkedAt)) throw new Error("Invalid saved analysis");
      seed.previous = snapshot;
      seed.peakMarketCap = snapshot.peakMarketCap;
      seed.lowMarketCap = snapshot.lowMarketCap;
      seed.checks = (seed.checks || 0) + 1;
    } else if (name === "notify" || name === "notifyCandidate") {
      // Legacy notifications returned void. New notifications explicitly return false if suppressed.
      if (step.output != null && await decode(step.output) === false) continue;
      const input = await decode(step.input) as { args?: [Snapshot] } | [Snapshot];
      const snapshot = (Array.isArray(input) ? input : input?.args)?.[0];
      if (snapshot?.launch?.mint !== launch.mint) throw new Error("Invalid saved notification");
      seed.everAlerted = true;
      if (name === "notify") seed.lastNotified = snapshot.status;
      else seed.candidateNotified = true;
    }
  }
  return { launch, seed };
}
