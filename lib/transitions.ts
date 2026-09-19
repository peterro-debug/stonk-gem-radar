import type { SignalStatus } from "./types";

const strength: Record<SignalStatus, number> = {
  "NO SIGNAL": 0,
  "SKIP": 0,
  "FLASH": 1,
  "EARLY WATCH": 2,
  "BUILD WATCH": 2,
  "REAWAKENING": 3,
  "RECLAIM": 4,
  "GEM": 5,
  "INVALIDATED": -1,
};

export function isAlertStatus(status: SignalStatus): boolean {
  return status !== "NO SIGNAL" && status !== "SKIP";
}

export function shouldNotify(previous: SignalStatus, current: SignalStatus): boolean {
  if (current === previous || current === "NO SIGNAL" || current === "SKIP") return false;
  if (current === "INVALIDATED") return previous !== "NO SIGNAL" && previous !== "SKIP" && previous !== "INVALIDATED";
  if (current === "REAWAKENING") return previous !== "REAWAKENING" && previous !== "RECLAIM" && previous !== "GEM";
  if (current === "RECLAIM") return previous !== "RECLAIM" && previous !== "GEM";
  if (current === "GEM") return previous !== "GEM";
  return strength[current] > strength[previous];
}
