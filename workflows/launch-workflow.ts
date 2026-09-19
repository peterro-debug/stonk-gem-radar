import { createHook, sleep } from "workflow";
import type { AnalysisContext, Launch, RadarRunResult, SignalStatus, Snapshot } from "@/lib/types";
import { CHECKPOINT_AGES_MS, DAY, MINUTE } from "@/lib/constants";
import { analyzeLaunch } from "@/lib/analyze";
import { formatAlert } from "@/lib/format";
import { sendTelegram } from "@/lib/telegram";
import { isAlertStatus, shouldNotify } from "@/lib/transitions";
import { formatCandidate, isEarlyNameCandidate } from "@/lib/candidate";

async function check(launch: Launch, context: AnalysisContext): Promise<Snapshot> {
  "use step";
  return analyzeLaunch(launch, context);
}

async function notify(snapshot: Snapshot): Promise<void> {
  "use step";
  await sendTelegram(formatAlert(snapshot));
}

async function notifyCandidate(snapshot: Snapshot): Promise<void> {
  "use step";
  await sendTelegram(formatCandidate(snapshot));
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

export async function launchWorkflow(launch: Launch): Promise<RadarRunResult> {
  "use workflow";

  // The deterministic hook acts as a 21-day per-mint mutex. Hourly discovery
  // and the real-time Helius webhook can safely race without creating two
  // long-running monitors for the same token.
  const lock = createHook({ token: `stonk-radar:${launch.mint}` });
  const conflict = await lock.getConflict();
  if (conflict) {
    return {
      mint: launch.mint,
      lastStatus: "NO SIGNAL",
      checks: 0,
      dedupedTo: conflict.runId,
      stoppedReason: "active monitor already owns this mint",
    };
  }

  let previous: Snapshot | undefined;
  let peakMarketCap: number | undefined;
  let lowMarketCap: number | undefined;
  let lastNotified: SignalStatus = "NO SIGNAL";
  let lastStatus: SignalStatus = "NO SIGNAL";
  let everAlerted = false;
  let candidateNotified = false;
  let checks = 0;
  let stoppedReason: string | undefined;

  // Allow first-trade indexers to settle. Backfilled tokens pay the same small
  // delay, keeping the workflow shape deterministic for all start sources.
  await sleep("20s");

  for (const targetAgeMs of CHECKPOINT_AGES_MS) {
    const currentAgeMs = previous ? previous.ageMinutes * MINUTE : Math.max(0, targetAgeMs - 20_000);
    if (previous && targetAgeMs <= currentAgeMs + 5_000) continue;

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
      if (waitMs > 0) await sleep(waitMs);
    }

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
      await notifyCandidate(snapshot);
      candidateNotified = true;
    }

    if (shouldNotify(lastNotified, snapshot.status)) {
      await notify(snapshot);
      lastNotified = snapshot.status;
      everAlerted = everAlerted || isAlertStatus(snapshot.status);
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
