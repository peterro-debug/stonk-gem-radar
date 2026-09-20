import { createHook, sleep, FatalError, RetryableError, getStepMetadata } from "workflow";
import type { AnalysisContext, Launch, LaunchMonitorSeed, RadarRunResult, SignalStatus, Snapshot } from "@/lib/types";
import { CHECKPOINT_AGES_MS, DAY, MINUTE } from "@/lib/constants";
import { analyzeLaunch } from "@/lib/analyze";
import { formatAlert } from "@/lib/format";
import { sendTelegram } from "@/lib/telegram";
import { isAlertStatus, shouldNotify } from "@/lib/transitions";
import { formatCandidate, isEarlyNameCandidate } from "@/lib/candidate";
import { maySendAlert, positiveAlertBlockers } from "@/lib/alert-policy";

async function check(launch: Launch, context: AnalysisContext): Promise<Snapshot> {
  "use step";
  const snapshot = await analyzeLaunch(launch, context);
  // A temporary provider failure must not push an older token's next useful
  // check out to the next day-scale checkpoint. Durable backoff avoids bursts.
  if (snapshot.status === "NO SIGNAL" && snapshot.holders.error && getStepMetadata().attempt < 3) {
    throw new RetryableError("Holder provider unavailable; retrying with backoff", { retryAfter: "90s" });
  }
  return snapshot;
}
check.maxRetries = 3;

async function notify(snapshot: Snapshot, everAlerted: boolean): Promise<boolean> {
  "use step";
  if (!maySendAlert(snapshot, everAlerted)) return false;
  await sendTelegram(formatAlert(snapshot), snapshot.launch.mint);
  return true;
}

async function notifyCandidate(snapshot: Snapshot): Promise<boolean> {
  "use step";
  if (positiveAlertBlockers(snapshot, Date.now()).length) return false;
  await sendTelegram(formatCandidate(snapshot), snapshot.launch.mint);
  return true;
}

export function shouldTrackBuild(snapshot: Snapshot, everAlerted: boolean): boolean {
  return everAlerted
    || (snapshot.ageMinutes < 360 && snapshot.holders.sampleComplete === false)
    || snapshot.score >= 45
    || snapshot.narrative.score >= 3
    || snapshot.rewards.nativeQuoteReward
    || (snapshot.holders.holders >= 60 && (snapshot.pair.volume24h || 0) >= 20_000);
}

export function shouldTrackReawakening(snapshot: Snapshot, everAlerted: boolean): boolean {
  return everAlerted
    || snapshot.status === "REAWAKENING"
    || snapshot.status === "RECLAIM"
    || snapshot.status === "GEM"
    || snapshot.narrative.score >= 4
    || (snapshot.rewards.nativeQuoteReward && (snapshot.rewards.rewardedHolders || 0) >= 100)
    || snapshot.score >= 60;
}

export async function launchWorkflow(launch: Launch, seed?: LaunchMonitorSeed, predecessor?: string): Promise<RadarRunResult> {
  "use workflow";

  // The deterministic hook acts as a 21-day per-mint mutex. Hourly discovery
  // and the real-time Helius webhook can safely race without creating two
  // long-running monitors for the same token.
  let lock;
  for (let attempt = 0; attempt < 30; attempt++) {
    lock = createHook({ token: `stonk-radar:${launch.mint}` });
    const conflict = await lock.getConflict();
    if (!conflict) break;
    lock.dispose();
    lock = undefined;
    if (conflict.runId !== predecessor) return { mint: launch.mint, lastStatus: "NO SIGNAL", checks: 0,
      dedupedTo: conflict.runId, stoppedReason: "active monitor already owns this mint" };
    await sleep("2s");
  }
  if (!lock) throw new FatalError("Previous monitor did not release its lock");

  let previous = seed?.previous;
  let peakMarketCap = seed?.peakMarketCap;
  let lowMarketCap = seed?.lowMarketCap;
  let lastNotified: SignalStatus = seed?.lastNotified ?? "NO SIGNAL";
  let lastStatus: SignalStatus = "NO SIGNAL";
  let everAlerted = seed?.everAlerted ?? false;
  let candidateNotified = seed?.candidateNotified ?? false;
  let checks = seed?.checks ?? 0;
  let forceCheck = Boolean(seed);
  let stoppedReason: string | undefined;

  // Allow first-trade indexers to settle. Backfilled tokens pay the same small
  // delay, keeping the workflow shape deterministic for all start sources.
  await sleep("20s");

  for (const targetAgeMs of CHECKPOINT_AGES_MS) {
    const currentAgeMs = previous ? previous.ageMinutes * MINUTE : Math.max(0, targetAgeMs - 20_000);
    if (!forceCheck && previous && targetAgeMs <= currentAgeMs + 5_000) continue;

    if (previous) {
      if (previous.status === "SKIP" || previous.status === "INVALIDATED") {
        stoppedReason = `hard stop: ${previous.status}`;
        break;
      }
      if (targetAgeMs > 20 * MINUTE && previous.ageMinutes >= 20 && !shouldTrackBuild(previous, everAlerted)) {
        stoppedReason = "did not qualify for BUILD tracking";
        break;
      }
      if (targetAgeMs > 4 * DAY && previous.ageMinutes >= 4 * 24 * 60 && !shouldTrackReawakening(previous, everAlerted)) {
        stoppedReason = "did not qualify for REAWAKENING tracking";
        break;
      }

      const waitMs = Math.max(0, targetAgeMs - currentAgeMs);
      if (!forceCheck && waitMs > 0) await sleep(waitMs);
    }
    forceCheck = false;

    const snapshot = await check(launch, {
      previous,
      peakMarketCap,
      lowMarketCap,
      everAlerted,
    });
    checks += 1;
    peakMarketCap = snapshot.peakMarketCap;
    lowMarketCap = snapshot.lowMarketCap;
    lastStatus = snapshot.status;

    if (!candidateNotified && isEarlyNameCandidate(snapshot) && !isAlertStatus(snapshot.status)) {
      if (await notifyCandidate(snapshot)) {
        candidateNotified = true;
        everAlerted = true;
      }
    }

    if (shouldNotify(lastNotified, snapshot.status) || (everAlerted && snapshot.status === "INVALIDATED" && lastNotified === "NO SIGNAL")) {
      if (await notify(snapshot, everAlerted)) {
        lastNotified = snapshot.status;
        everAlerted = everAlerted || isAlertStatus(snapshot.status);
      }
    }
    previous = snapshot;
  }

  return {
    mint: launch.mint,
    lastStatus,
    peakMarketCap,
    lowMarketCap,
    checks,
    stoppedReason,
  };
}
