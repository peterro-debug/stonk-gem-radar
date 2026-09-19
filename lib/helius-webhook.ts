import { LAUNCHLAB_PROGRAM } from "@/lib/constants";

const HELIUS_WEBHOOKS_URL = "https://mainnet.helius-rpc.com/v0/webhooks";

export type HeliusWebhook = {
  webhookID?: string;
  webhookURL?: string;
  transactionTypes?: string[];
  accountAddresses?: string[];
  webhookType?: string;
  authHeader?: string;
  encoding?: string;
  txnStatus?: string;
};

type DesiredWebhook = Required<Omit<HeliusWebhook, "webhookID">>;

export type HeliusWebhookSetup = {
  action: "created" | "updated" | "unchanged";
  webhookId: string;
  webhookUrl: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeUrl(value: string | undefined): string {
  return (value || "").replace(/\/+$/, "");
}

function sameStrings(left: string[] | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function desiredHeliusWebhook(origin: string, authHeader: string): DesiredWebhook {
  return {
    webhookURL: `${normalizeUrl(origin)}/api/helius`,
    transactionTypes: ["ANY"],
    accountAddresses: [LAUNCHLAB_PROGRAM],
    webhookType: "raw",
    authHeader,
    encoding: "json",
    txnStatus: "success",
  };
}

export function findWebhookForUrl(webhooks: HeliusWebhook[], webhookURL: string): HeliusWebhook | undefined {
  const target = normalizeUrl(webhookURL);
  return webhooks.find((webhook) => normalizeUrl(webhook.webhookURL) === target);
}

export function webhookNeedsUpdate(current: HeliusWebhook, desired: DesiredWebhook): boolean {
  return normalizeUrl(current.webhookURL) !== normalizeUrl(desired.webhookURL)
    || !sameStrings(current.transactionTypes, desired.transactionTypes)
    || !sameStrings(current.accountAddresses, desired.accountAddresses)
    || current.webhookType !== desired.webhookType
    || current.authHeader !== desired.authHeader
    || current.encoding !== desired.encoding
    || current.txnStatus !== desired.txnStatus;
}

async function heliusRequest<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${HELIUS_WEBHOOKS_URL}${path}?api-key=${encodeURIComponent(apiKey)}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Helius webhook request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function ensureHeliusWebhook(origin: string): Promise<HeliusWebhookSetup> {
  const apiKey = required("HELIUS_API_KEY");
  const desired = desiredHeliusWebhook(origin, required("HELIUS_WEBHOOK_AUTH_SECRET"));
  const webhooks = await heliusRequest<HeliusWebhook[]>(apiKey, "");
  const existing = findWebhookForUrl(webhooks, desired.webhookURL);

  if (!existing) {
    const created = await heliusRequest<HeliusWebhook>(apiKey, "", {
      method: "POST",
      body: JSON.stringify(desired),
    });
    if (!created.webhookID) throw new Error("Helius did not return a webhook ID");
    return { action: "created", webhookId: created.webhookID, webhookUrl: desired.webhookURL };
  }

  if (!existing.webhookID) throw new Error("Existing Helius webhook has no ID");
  if (!webhookNeedsUpdate(existing, desired)) {
    return { action: "unchanged", webhookId: existing.webhookID, webhookUrl: desired.webhookURL };
  }

  const updated = await heliusRequest<HeliusWebhook>(apiKey, `/${encodeURIComponent(existing.webhookID)}`, {
    method: "PUT",
    body: JSON.stringify(desired),
  });
  return {
    action: "updated",
    webhookId: updated.webhookID || existing.webhookID,
    webhookUrl: desired.webhookURL,
  };
}
