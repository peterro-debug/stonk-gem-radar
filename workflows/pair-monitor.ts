import { createHook, getWorkflowMetadata, getWritable, sleep, FatalError } from "workflow";
import { start } from "workflow/api";
import { listQuotePairs } from "@/lib/pairs";
import { listRecentLaunches, stonkRowToLaunch } from "@/lib/stonk";
import { activePairEvent, announcementEvents, emptyMonitorState, EVENT_WINDOW_MS, formatPairEvent, observePairs,
  PAIR_MONITOR_TOKEN, type PairMonitorState } from "@/lib/pair-events";
import { pollOfficialX } from "@/lib/x-feed";
import { sendTelegram } from "@/lib/telegram";
import type { Launch, PairEvent, QuoteMeta } from "@/lib/types";
import { launchWorkflow } from "./launch-workflow";
import { discoverCandidates } from "@/lib/discovery";

const errorText = (error: unknown) => error instanceof Error ? error.message : "source unavailable";

export async function pollPairSources(previous: PairMonitorState) {
  "use step";
  const now = Date.now();
  let state: PairMonitorState = { ...previous, checkedAt: now, lastStartedCount: 0,
    seenLaunches: Object.fromEntries(Object.entries(previous.seenLaunches).filter(([, at]) => now - at < EVENT_WINDOW_MS)) };
  const since = Math.max(state.launchCursor ?? now - 5 * 60_000, now - EVENT_WINDOW_MS);
  const discoveryDue = !state.discoveryLastSuccessAt || now - state.discoveryLastSuccessAt >= 30 * 60_000;
  const [registry, tokens, x, discovery] = await Promise.allSettled([
    listQuotePairs(), listRecentLaunches(since), pollOfficialX(state.x, now),
    discoveryDue ? discoverCandidates() : Promise.resolve([]),
  ]);
  const events: PairEvent[] = [];
  if (registry.status === "fulfilled") {
    const observed = observePairs(state, registry.value, now);
    state = observed.state;
    events.push(...observed.added);
  } else state.registryError = errorText(registry.reason);

  if (x.status === "fulfilled") {
    state.x = x.value.cursor;
    state.pendingPosts = [...new Map([...state.pendingPosts, ...x.value.posts].map(post => [post.id, post])).values()]
      .filter(post => now - Date.parse(post.created_at) <= EVENT_WINDOW_MS);
  }
  // Keep unmatched posts so an announcement arriving before /pairs still matches later.
  for (const event of announcementEvents(state.pendingPosts, state.knownPairs, now)) {
    if (state.events.some(old => old.quoteMint === event.quoteMint && old.sourceUrl === event.sourceUrl)) continue;
    if (!activePairEvent(state.events, event.quoteMint, now)) events.push(event);
    state.events.push(event);
  }
  state.events = state.events.filter(event => now - event.detectedAt <= EVENT_WINDOW_MS);

  const launches: Launch[] = [];
  if (tokens.status === "fulfilled") {
    const candidates = [...new Map(tokens.value.map(row => [row.mint, row])).values()]
      .map(stonkRowToLaunch).filter((launch): launch is Launch => Boolean(launch))
      .filter(launch => launch.launchedAt >= since && launch.launchedAt <= now + 60_000 && !state.seenLaunches[launch.mint])
      .sort((a, b) => a.launchedAt - b.launchedAt);
    for (const launch of candidates.slice(0, 25)) {
      launches.push({ ...launch, pairEvent: activePairEvent(state.events, launch.quoteMint, now) });
      state.seenLaunches[launch.mint] = now;
    }
    state.lastStartedCount = launches.length;
    state.launchesLastSuccessAt = now;
    state.launchesError = undefined;
    // Preserve overlap for delayed indexing and retain the cursor while backlogged.
    state.launchCursor = candidates.length > 25 ? since : now - 5 * 60_000;
  } else state.launchesError = errorText(tokens.reason);
  if (discoveryDue) {
    if (discovery.status === "fulfilled") {
      state.discoveryLastSuccessAt = now;
      state.discoveryError = undefined;
      for (const candidate of discovery.value.filter(c => !state.seenLaunches[c.launch.mint]).slice(0, 5)) {
        launches.push(candidate.launch);
        state.seenLaunches[candidate.launch.mint] = now;
      }
    } else state.discoveryError = errorText(discovery.reason);
  }
  state.lastStartedCount = launches.length;
  return { state, events, launches };
}

async function enqueueLaunch(launch: Launch) {
  "use step";
  try {
    const run = await start(launchWorkflow, [launch], { deploymentId: "latest" });
    return { runId: run.runId };
  } catch { return { error: "Could not enqueue launch analysis; retrying next poll" }; }
}

async function notifyPair(event: PairEvent, quote?: QuoteMeta) {
  "use step";
  try { await sendTelegram(formatPairEvent(event, quote)); return true; }
  catch { return false; }
}

async function checkpoint(state: PairMonitorState) {
  "use step";
  const writer = getWritable<PairMonitorState>({ namespace: "state" }).getWriter();
  try { await writer.write(state); } finally { writer.releaseLock(); }
}

async function continueOnLatest(state: PairMonitorState, predecessor: string): Promise<string> {
  "use step";
  const next = await start(pairMonitorWorkflow, [state, predecessor], { deploymentId: "latest" });
  return next.runId;
}

// Six-hour runs bound replay history. Successors inherit the durable cursor and
// baseline, and target the latest deployment. Daily cron is the recovery watchdog.
export async function pairMonitorWorkflow(seed?: PairMonitorState, predecessor?: string): Promise<{ dedupedTo?: string; nextRunId?: string }> {
  "use workflow";
  let lock;
  for (let attempt = 0; attempt < 30; attempt++) {
    lock = createHook({ token: PAIR_MONITOR_TOKEN });
    const conflict = await lock.getConflict();
    if (!conflict) break;
    lock.dispose();
    lock = undefined;
    if (conflict.runId !== predecessor) return { dedupedTo: conflict.runId };
    await sleep("2s");
  }
  if (!lock) throw new FatalError("Pair monitor handoff did not release its lock");
  let state = seed ?? emptyMonitorState();
  try {
    for (let tick = 0; tick < 360; tick++) {
      const result = await pollPairSources(state);
      state = result.state;
      // Queue analysis before notifications so a slow Telegram API can't delay discovery.
      for (const launch of result.launches) {
        const queued = await enqueueLaunch(launch);
        if (queued.error) {
          delete state.seenLaunches[launch.mint];
          state.launchCursor = Math.min(state.launchCursor ?? launch.launchedAt, launch.launchedAt);
          state.launchesError = queued.error;
        }
      }
      const pending: PairEvent[] = [];
      for (const event of [...(state.pendingNotifications || []), ...result.events]) {
        if (Date.now() - event.detectedAt > EVENT_WINDOW_MS) continue;
        if (!await notifyPair(event, state.knownPairs.find(p => p.mint === event.quoteMint))) pending.push(event);
      }
      state.pendingNotifications = pending;
      state.notificationError = pending.length ? "Telegram delivery pending; retrying next poll" : undefined;
      await checkpoint(state);
      await sleep("60s");
    }
    const nextRunId = await continueOnLatest(state, getWorkflowMetadata().workflowRunId);
    return { nextRunId };
  } finally {
    lock.dispose();
  }
}
