import { beforeEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/pair-monitor-status", () => ({ pairMonitorStatus: sdk.status }));
vi.mock("workflow/api", () => ({ start: sdk.start, getRun: () => ({ status: Promise.resolve("running"), cancel: sdk.cancel }) }));
vi.mock("@/workflows/pair-monitor", () => ({ pairMonitorWorkflow: function monitor() {} }));
import { ensurePairMonitor } from "@/lib/ensure-pair-monitor";

beforeEach(() => vi.clearAllMocks());
it("persists a stale monitor's cursor in a successor before cancelling the predecessor", async () => {
  const state = { launchCursor: 123, knownPairs: [{ mint: "quote" }], seenLaunches: { mint: 456 } };
  sdk.status.mockResolvedValue({ status: "stale", runId: "old", state });
  sdk.start.mockResolvedValue({ runId: "new" });
  expect(await ensurePairMonitor()).toMatchObject({ status: "restarting", runId: "new", previousRunId: "old" });
  expect(sdk.start.mock.calls[0][1]).toEqual([state, "old"]);
  expect(sdk.start.mock.invocationCallOrder[0]).toBeLessThan(sdk.cancel.mock.invocationCallOrder[0]);
});
it("keeps the original monitor if successor persistence fails", async () => {
  sdk.status.mockResolvedValue({ status: "stale", runId: "old", state: {} });
  sdk.start.mockRejectedValue(new Error("queue unavailable"));
  await expect(ensurePairMonitor()).rejects.toThrow("queue unavailable");
  expect(sdk.cancel).not.toHaveBeenCalled();
});
it("moves an active monitor to the current deployment with its discovery cursor intact", async () => {
  const state = { launchCursor: 123, discoveryLastSuccessAt: 456, seenLaunches: {}, knownPairs: [] };
  sdk.status.mockResolvedValue({ status: "active", deploymentOutdated: true, runId: "old", state });
  sdk.start.mockResolvedValue({ runId: "new" });
  expect(await ensurePairMonitor()).toMatchObject({ status: "restarting", previousRunId: "old" });
  expect(sdk.start.mock.calls[0][1]).toEqual([state, "old"]);
});
