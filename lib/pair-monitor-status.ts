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
  const stream = run.getReadable<PairMonitorState>({ namespace: "state", startIndex: -1 });
  const tail = await stream.getTailIndex();
  if (tail < 0) { await stream.cancel(); return { status: "starting" as const, runId: hook.runId }; }
  const reader = stream.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Pair monitor state timed out")), 4_000); }),
    ]);
    const state = result.value;
    return { status: state?.checkedAt && Date.now() - state.checkedAt < 5 * 60_000 ? "active" as const : "stale" as const,
      runId: hook.runId, state };
  } finally {
    if (timeout) clearTimeout(timeout);
    await reader.cancel();
  }
}
