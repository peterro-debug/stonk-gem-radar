import { getHookByToken } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { observabilityRevivers, parseStepName } from "workflow/observability";
import { hydrateDataWithKey } from "@workflow/core/serialization-format";
import { importKey } from "@workflow/core/encryption";
import { HookNotFoundError } from "workflow/internal/errors";
import { PAIR_MONITOR_TOKEN, type PairMonitorState } from "./pair-events";

export async function pairMonitorStatus() {
  let hook;
  try { hook = await getHookByToken(PAIR_MONITOR_TOKEN); }
  catch (error) {
    if (HookNotFoundError.is(error)) return { status: "not-running" as const };
    throw error;
  }
  // Read a finite checkpoint. Live stream readers were waiting for another
  // chunk and timing out in production, despite completed polling steps.
  const world = getWorld();
  const steps = await world.steps.list({ runId: hook.runId,
    pagination: { limit: 100, sortOrder: "desc" }, resolveData: "none" });
  const checkpoint = steps.data.find(step => step.status === "completed"
    && parseStepName(step.stepName)?.functionName === "checkpoint");
  if (!checkpoint) return { status: "starting" as const, runId: hook.runId };
  const [step, run] = await Promise.all([
    world.steps.get(hook.runId, checkpoint.stepId), world.runs.get(hook.runId),
  ]);
  // SDK-managed run encryption stays server-side; no key is exposed in responses.
  const rawKey = await world.getEncryptionKeyForRun?.(run);
  const key = rawKey ? await importKey(rawKey) : undefined;
  const input = await hydrateDataWithKey(step.input, observabilityRevivers, key);
  const state = Array.isArray(input) ? input[0] as PairMonitorState : undefined;
  if (!state || state.version !== 1 || !Array.isArray(state.events)) throw new Error("Invalid pair monitor checkpoint");
  return { status: state.checkedAt && Date.now() - state.checkedAt < 5 * 60_000 ? "active" as const : "stale" as const,
    runId: hook.runId, state };
}
