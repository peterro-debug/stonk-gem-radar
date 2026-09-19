import { sleep } from "workflow";
import type { Launch, Snapshot } from "@/lib/types";
import { analyzeLaunch } from "@/lib/analyze";
import { formatAlert } from "@/lib/format";
import { sendTelegram } from "@/lib/telegram";

async function check(launch: Launch, peak?: number): Promise<Snapshot> {
  "use step";
  return analyzeLaunch(launch, peak);
}

async function notify(s: Snapshot): Promise<void> {
  "use step";
  await sendTelegram(formatAlert(s));
}

const strength: Record<Snapshot["status"], number> = {
  "NO SIGNAL": 0,
  "FLASH": 1,
  "EARLY WATCH": 2,
  "RECLAIM": 3,
  "GEM": 4,
  "SKIP": -1,
};

export async function launchWorkflow(launch: Launch) {
  "use workflow";

  let peak = 0;
  let lastNotified: Snapshot["status"] = "NO SIGNAL";

  // Give market/indexers a few seconds to expose the first trade/holder state.
  await sleep("20s");
  const schedule = ["0s", "2m40s", "4m", "5m", "8m"] as const;

  for (const delay of schedule) {
    if (delay !== "0s") await sleep(delay);
    const s = await check(launch, peak);
    peak = Math.max(peak, s.peakMarketCap || 0);

    const improved = strength[s.status] > strength[lastNotified];
    const importantReject = s.status === "SKIP" && lastNotified !== "NO SIGNAL";
    if ((improved && s.status !== "NO SIGNAL") || importantReject) {
      await notify(s);
      lastNotified = s.status;
    }
    if (s.status === "SKIP") break;
  }

  return { mint: launch.mint, lastStatus: lastNotified, peakMarketCap: peak };
}
