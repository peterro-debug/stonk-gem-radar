import { getHookByToken, getRun } from "workflow/api";
import { HookNotFoundError } from "workflow/internal/errors";
import { PAIR_MONITOR_TOKEN, type PairMonitorState } from "./pair-events";

export async function pairMonitorStatus() {
  let hook;
  try { hook = await getHookByToken(PAIR_MONITOR_TOKEN); }
  catch (error) {
    if (HookNotFoundError.is(error)) return { status: "not-running" as const };
    throw error;
  }
  const run = getRun(hook.runId);
  const probe = run.getReadable<PairMonitorState>({ namespace: "state" });
  const tail = await probe.getTailIndex();
  await probe.cancel().catch(() => {});
  if (tail < 0) return { status: "starting" as const, runId: hook.runId };
  const stream = run.getReadable<PairMonitorState>({ namespace: "state", startIndex: tail });
  const reader = stream.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Pair monitor state timed out")), 8_000); }),
    ]);
    const state = result.value;
    return { status: state?.checkedAt && Date.now() - state.checkedAt < 5 * 60_000 ? "active" as const : "stale" as const,
      runId: hook.runId, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return { status: "state-unavailable" as const, runId: hook.runId,
      stateError: message.replace(/https?:\/\/\S+/g, "[service endpoint]").slice(0, 240) };
  } finally {
    if (timeout) clearTimeout(timeout);
    await reader.cancel().catch(() => {});
  }
}
