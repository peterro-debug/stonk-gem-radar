import { createHook, getWorkflowMetadata, getWritable, sleep, FatalError } from "workflow";
import { start } from "workflow/api";
import { listQuotePairs } from "@/lib/pairs";
import { firstPairLaunchesFromRows, getPairLaunchFeed, listFirstPairLaunchesSince, listRecentLaunches, stonkRowToLaunch } from "@/lib/stonk";
import { activePairEvent, announcementEvents, emptyMonitorState, EVENT_WINDOW_MS, formatPairEvent, formatPairLaunchAlert, observePairs,
  PAIR_MONITOR_TOKEN, type PairLaunchAlert, type PairMonitorState } from "@/lib/pair-events";
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
    pairLaunchWatches: Object.fromEntries(Object.entries(previous.pairLaunchWatches || {})
      .filter(([, watch]) => now - watch.eventDetectedAt < EVENT_WINDOW_MS)
      .map(([mint, watch]) => [mint, { ...watch, ranked: [...(watch.ranked || [])],
        notifiedMints: { ...watch.notifiedMints } }])),
    seenLaunches: Object.fromEntries(Object.entries(previous.seenLaunches).filter(([, at]) => now - at < EVENT_WINDOW_MS)) };
  // The global feed is a live discovery lane, not an unbounded historical
  // replay. Clamp stale cursors so a prior outage cannot permanently overload it.
  const since = Math.max(state.launchCursor ?? now - 5 * 60_000, now - 10 * 60_000);
  const discoveryDue = !state.discoveryLastSuccessAt || now - state.discoveryLastSuccessAt >= 30 * 60_000;
  const [registry, tokens, x, discovery] = await Promise.allSettled([
    listQuotePairs(), listRecentLaunches(since), pollOfficialX(state.x, now),
    discoveryDue ? discoverCandidates() : Promise.resolve([]),
  ]);
  const events: PairEvent[] = [];
  if (registry.status === "fulfilled") {
    const observed = observePairs(state, registry.value, now);
    state = observed.state;
    state.pairLaunchWatches = state.pairLaunchWatches || {};
    for (const event of observed.added.filter(event => event.source === "stonk-registry")) {
      state.pairLaunchWatches[event.quoteMint] = {
        eventDetectedAt: event.detectedAt,
        ranked: [],
        notifiedMints: {},
      };
    }
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

  // Critical path for newly enabled main/quote pairs. This is deliberately
  // independent from the high-volume global launch feed, so a global backlog
  // cannot hide the first launches against a fresh pair such as PEPE/JEANPHIL.
  const activePairEvents = [...new Map(
    state.events
      .filter(event => now >= event.detectedAt && now - event.detectedAt <= EVENT_WINDOW_MS)
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .map(event => [event.quoteMint, event]),
  ).values()].slice(0, 10);
  const pairFeeds = await Promise.allSettled(activePairEvents.map(async event => {
    const feed = await getPairLaunchFeed(event.quoteMint);
    const watch = state.pairLaunchWatches?.[event.quoteMint];
    let ranked = watch
      ? firstPairLaunchesFromRows(feed.rows, event.detectedAt - 5 * 60_000, 3)
      : [];
    if (watch && (feed.total ?? feed.rows.length) > feed.rows.length) {
      ranked = await listFirstPairLaunchesSince(event.quoteMint, event.detectedAt - 5 * 60_000, 3);
    }
    return { event, rows: feed.rows, ranked };
  }));
  const pairCandidates: Launch[] = [];
  const pairLaunchAlerts: PairLaunchAlert[] = [];
  let pairFailures = 0;
  for (const result of pairFeeds) {
    if (result.status === "rejected") { pairFailures += 1; continue; }
    const { event, rows, ranked } = result.value;
    const watch = state.pairLaunchWatches?.[event.quoteMint];
    if (watch) {
      // Freeze #1/#2/#3 the first time each slot is observed. STONK can index
      // an older row late; that must never re-label a second token as the same rank.
      for (const row of ranked) {
        if (watch.ranked.length >= 3 || watch.ranked.some(saved => saved.mint === row.mint)) continue;
        const launchedAt = Date.parse(row.createdAt || "");
        if (!Number.isFinite(launchedAt)) continue;
        watch.ranked.push({ mint: row.mint, name: row.name, symbol: row.symbol, launchedAt });
      }
      watch.ranked.forEach((saved, index) => {
        const rank = (index + 1) as 1 | 2 | 3;
        if (!watch.notifiedMints[saved.mint]) {
          pairLaunchAlerts.push({ rank, quoteMint: event.quoteMint, mint: saved.mint,
            name: saved.name, symbol: saved.symbol, launchedAt: saved.launchedAt, event });
        }
      });
    }
    for (const row of rows) {
      const launch = stonkRowToLaunch(row);
      if (!launch || launch.quoteMint !== event.quoteMint || state.seenLaunches[launch.mint]) continue;
      // Allow a small indexing race where a launch can appear just before the
      // registry poll that noticed the newly enabled main pair.
      if (launch.launchedAt < event.detectedAt - 5 * 60_000 || launch.launchedAt > now + 60_000) continue;
      pairCandidates.push({ ...launch, pairEvent: event });
    }
  }
  if (activePairEvents.length) {
    if (pairFailures < activePairEvents.length) state.pairLaunchesLastSuccessAt = now;
    state.pairLaunchesError = pairFailures
      ? `${pairFailures}/${activePairEvents.length} active main-pair feeds unavailable`
      : undefined;
  } else {
    state.pairLaunchesError = undefined;
  }

  const launches: Launch[] = [];
  const pairUnique = [...new Map(pairCandidates.map(launch => [launch.mint, launch])).values()]
    .sort((a, b) => a.launchedAt - b.launchedAt);
  const pairSelected = pairUnique.slice(0, 25);
  launches.push(...pairSelected);
  for (const launch of pairSelected) state.seenLaunches[launch.mint] = now;

  if (tokens.status === "fulfilled") {
    const candidates = [...new Map(tokens.value.map(row => [row.mint, row])).values()]
      .map(stonkRowToLaunch).filter((launch): launch is Launch => Boolean(launch))
      .filter(launch => launch.launchedAt >= since && launch.launchedAt <= now + 60_000 && !state.seenLaunches[launch.mint])
      .sort((a, b) => a.launchedAt - b.launchedAt);
    const remainingSlots = Math.max(0, 25 - pairSelected.length);
    const selected = candidates.slice(0, remainingSlots);
    for (const launch of selected) {
      launches.push({ ...launch, pairEvent: activePairEvent(state.events, launch.quoteMint, now) });
      state.seenLaunches[launch.mint] = now;
    }
    state.launchesLastSuccessAt = now;
    state.launchesError = undefined;
    // Advance through a backlog instead of pinning the cursor forever. A small
    // overlap remains because the next query uses >= and seenLaunches dedupes.
    if (candidates.length > selected.length) {
      if (selected.length) state.launchCursor = Math.max(since, selected[selected.length - 1].launchedAt);
    } else {
      state.launchCursor = now - 5 * 60_000;
    }
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
  return { state, events, launches, pairLaunchAlerts };
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
  try { await sendTelegram(formatPairEvent(event, quote), event.quoteMint); return true; }
  catch { return false; }
}

async function notifyPairLaunch(alert: PairLaunchAlert, quote?: QuoteMeta) {
  "use step";
  try { await sendTelegram(formatPairLaunchAlert(alert, quote), alert.mint); return true; }
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
      // Queue analysis immediately; Telegram delivery is independent and can retry.
      for (const launch of result.launches) {
        const queued = await enqueueLaunch(launch);
        if (queued.error) {
          delete state.seenLaunches[launch.mint];
          if (!launch.pairEvent) state.launchCursor = Math.min(state.launchCursor ?? launch.launchedAt, launch.launchedAt);
          state.launchesError = queued.error;
        }
      }
      // Main-pair announcement is sent before #1/#2/#3 so Telegram reads in
      // the same order as the event actually happened.
      const pending: PairEvent[] = [];
      for (const event of [...(state.pendingNotifications || []), ...result.events]) {
        if (Date.now() - event.detectedAt > EVENT_WINDOW_MS) continue;
        if (!await notifyPair(event, state.knownPairs.find(p => p.mint === event.quoteMint))) pending.push(event);
      }
      state.pendingNotifications = pending;
      let pairLaunchDeliveryFailed = false;
      for (const alert of result.pairLaunchAlerts.sort((a, b) => a.rank - b.rank)) {
        const watch = state.pairLaunchWatches?.[alert.quoteMint];
        if (!watch || watch.notifiedMints[alert.mint]) continue;
        if (await notifyPairLaunch(alert, state.knownPairs.find(p => p.mint === alert.quoteMint))) {
          watch.notifiedMints[alert.mint] = alert.rank;
        } else {
          pairLaunchDeliveryFailed = true;
        }
      }
      state.notificationError = pending.length || pairLaunchDeliveryFailed
        ? "Telegram delivery pending; retrying next poll" : undefined;
      await checkpoint(state);
      await sleep("60s");
    }
    const nextRunId = await continueOnLatest(state, getWorkflowMetadata().workflowRunId);
    return { nextRunId };
  } finally {
    lock.dispose();
  }
}
