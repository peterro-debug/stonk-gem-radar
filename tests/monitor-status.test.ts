import { beforeEach, expect, it, vi } from "vitest";
import { emptyMonitorState } from "@/lib/pair-events";

const sdk = vi.hoisted(() => ({ hook: vi.fn(), list: vi.fn(), step: vi.fn(), run: vi.fn() }));
vi.mock("workflow/api", () => ({ getHookByToken: sdk.hook }));
vi.mock("workflow/runtime", () => ({ getWorld: () => ({ getDeploymentId: async () => "current", steps: { list: sdk.list, get: sdk.step }, runs: { get: sdk.run } }) }));
import { pairMonitorStatus } from "@/lib/pair-monitor-status";

beforeEach(() => { vi.clearAllMocks(); sdk.hook.mockResolvedValue({ runId: "run" }); sdk.run.mockResolvedValue({ runId: "run" }); });
it("reads a completed persisted checkpoint while a newer checkpoint is still pending", async () => {
  sdk.list.mockResolvedValue({ data: [
    { stepId: "pending", status: "running", stepName: "step//./workflows/pair-monitor//checkpoint" },
    { stepId: "last", status: "completed", stepName: "step//./workflows/pair-monitor//checkpoint" },
  ] });
  const state = { ...emptyMonitorState(), checkedAt: Date.now(), registryLastSuccessAt: Date.now() };
  // Match the SDK's persisted step-call envelope, not just the argument array.
  const { dehydrateStepReturnValue } = await import("@workflow/core/serialization");
  sdk.step.mockResolvedValue({ input: await dehydrateStepReturnValue({ args: [state], closureVars: undefined, thisVal: undefined }, "run", undefined) });
  expect(await pairMonitorStatus()).toMatchObject({ status: "active", state });
  expect(sdk.step).toHaveBeenCalledWith("run", "last");
});
it("reports starting until the first checkpoint has completed", async () => {
  sdk.list.mockResolvedValue({ data: [] });
  expect(await pairMonitorStatus()).toEqual({ status: "starting", runId: "run" });
});
it("does not present an old checkpoint as a live feed", async () => {
  sdk.list.mockResolvedValue({ data: [{ stepId: "last", status: "completed", stepName: "step//./workflows/pair-monitor//checkpoint" }] });
  const { dehydrateStepReturnValue } = await import("@workflow/core/serialization");
  sdk.step.mockResolvedValue({ input: await dehydrateStepReturnValue({ args: [{ ...emptyMonitorState(), checkedAt: Date.now() - 600_000 }] }, "run", undefined) });
  expect((await pairMonitorStatus()).status).toBe("stale");
});
