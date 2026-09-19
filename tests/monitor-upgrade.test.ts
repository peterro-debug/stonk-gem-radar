import { beforeEach, expect, it, vi } from "vitest";
import { dehydrateStepReturnValue } from "@workflow/core/serialization";
import { STONK_REWARD_CONFIG } from "@/lib/constants";

const sdk = vi.hoisted(() => ({ run: vi.fn(), steps: vi.fn(), runs: vi.fn(), deployment: vi.fn() }));
vi.mock("workflow/runtime", () => ({ getWorld: () => ({ runs: { get: sdk.run, list: sdk.runs },
  steps: { list: sdk.steps }, getDeploymentId: sdk.deployment }) }));
import { captureLaunchState, outdatedLaunchRuns } from "@/lib/monitor-upgrade";

const launch = { mint: "mint", platformConfig: STONK_REWARD_CONFIG };
const saved = { launch, checkedAt: Date.now(), status: "EARLY WATCH", peakMarketCap: 90_000, lowMarketCap: 20_000 };
const encode = (v: unknown) => dehydrateStepReturnValue(v, "run", undefined);

beforeEach(async () => {
  vi.clearAllMocks();
  sdk.deployment.mockResolvedValue("new-deployment");
  sdk.run.mockResolvedValue({ runId: "run", status: "running", workflowName: "workflow//./workflows/launch-workflow//launchWorkflow", input: await encode([launch]) });
});

it("preserves price history and successful notification state using actual SDK serialization", async () => {
  sdk.steps.mockResolvedValue({ data: [
    { status: "completed", stepName: "step//./workflows/launch-workflow//check", output: await encode(saved) },
    { status: "completed", stepName: "step//./workflows/launch-workflow//notify", input: await encode({ args: [saved] }), output: await encode(undefined) },
  ], hasMore: false });
  expect(await captureLaunchState("run")).toMatchObject({ launch, seed: { previous: saved, peakMarketCap: 90_000,
    lowMarketCap: 20_000, everAlerted: true, lastNotified: "EARLY WATCH", checks: 1 } });
});

it("does not interrupt a delivery or treat a suppressed notification as delivered", async () => {
  sdk.steps.mockResolvedValueOnce({ data: [{ status: "running", stepName: "step//./workflows/launch-workflow//notify" }], hasMore: false });
  expect(await captureLaunchState("run")).toBe("busy");
  sdk.steps.mockResolvedValueOnce({ data: [{ status: "completed", stepName: "step//./workflows/launch-workflow//notify",
    input: await encode({ args: [saved] }), output: await encode(false) }], hasMore: false });
  const captured = await captureLaunchState("run");
  expect(typeof captured).toBe("object");
  if (typeof captured === "object") expect(captured.seed.everAlerted).toBeUndefined();
});

it("paginates legacy runs and leaves current deployments and unrelated workflows alone", async () => {
  const name = "workflow//./workflows/launch-workflow//launchWorkflow";
  sdk.runs.mockResolvedValueOnce({ data: [{ runId: "old", workflowName: name, deploymentId: "old" },
    { runId: "current", workflowName: name, deploymentId: "new-deployment" }], hasMore: true, cursor: "page2" })
    .mockResolvedValueOnce({ data: [{ runId: "pair", workflowName: "workflow//./workflows/pair-monitor//pairMonitorWorkflow", deploymentId: "old" }], hasMore: false })
    .mockResolvedValueOnce({ data: [{ runId: "pending", workflowName: name, deploymentId: "old" }], hasMore: false });
  expect(await outdatedLaunchRuns()).toEqual(["old", "pending"]);
});
