import { describe, expect, it } from "vitest";
import { desiredHeliusWebhook, findWebhookForUrl, webhookNeedsUpdate } from "@/lib/helius-webhook";

describe("Helius webhook setup", () => {
  const desired = desiredHeliusWebhook("https://radar.example/", "secret");

  it("builds a raw LaunchLab webhook for the deployment", () => {
    expect(desired).toMatchObject({
      webhookURL: "https://radar.example/api/helius",
      transactionTypes: ["ANY"],
      webhookType: "raw",
      authHeader: "secret",
      encoding: "json",
      txnStatus: "success",
    });
    expect(desired.accountAddresses).toHaveLength(1);
  });

  it("reuses the webhook belonging to the same deployment", () => {
    const match = { webhookID: "ours", ...desired };
    const other = { webhookID: "other", ...desired, webhookURL: "https://other.example/api/helius" };
    expect(findWebhookForUrl([other, match], "https://radar.example/api/helius/")?.webhookID).toBe("ours");
    expect(webhookNeedsUpdate(match, desired)).toBe(false);
  });

  it("updates a stale authorization value", () => {
    expect(webhookNeedsUpdate({ webhookID: "ours", ...desired, authHeader: "old" }, desired)).toBe(true);
  });
});
