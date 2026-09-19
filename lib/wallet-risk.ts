import { WALLET_LIMITS } from "./constants";
import type { WalletRiskMetrics } from "./types";

function n(value: unknown): number | undefined {
  if (value == null || value === "" || typeof value === "boolean") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown): boolean {
  return value === true;
}

async function rugCheckReport(mint: string): Promise<any | undefined> {
  try {
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

async function specialistReport(mint: string, launchedAt: number): Promise<any | undefined> {
  const url = process.env.WALLET_RISK_API_URL;
  if (!url) return undefined;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    if (process.env.WALLET_RISK_API_KEY) {
      headers.authorization = `Bearer ${process.env.WALLET_RISK_API_KEY}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ chain: "solana", mint, launchedAt }),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

function poolTokenAccounts(report: any, mint: string): string[] {
  const accounts = new Set<string>();
  for (const market of report?.markets || []) {
    if (market?.mintA === mint && market?.liquidityA) accounts.add(market.liquidityA);
    if (market?.mintB === mint && market?.liquidityB) accounts.add(market.liquidityB);
  }
  return [...accounts];
}

function specialistNumber(report: any, key: string, nestedKey: string): number | undefined {
  return n(report?.[key]) ?? n(report?.[nestedKey]?.supplyPct) ?? n(report?.[nestedKey]?.pct);
}

export async function getWalletRiskMetrics(mint: string, launchedAt: number): Promise<WalletRiskMetrics> {
  const [rug, specialist] = await Promise.all([
    rugCheckReport(mint),
    specialistReport(mint, launchedAt),
  ]);

  const flags: string[] = [];
  const supply = n(rug?.token?.supply);
  const networks: any[] = Array.isArray(rug?.insiderNetworks) ? rug.insiderNetworks : [];
  const insiderRaw = networks.reduce((sum, network) => sum + (n(network?.tokenAmount) || 0), 0);
  const graphInsiderWallets = n(rug?.graphInsidersDetected);
  const insiderSupplyPct = supply && supply > 0 ? (insiderRaw / supply) * 100 : undefined;
  const graphChecked = graphInsiderWallets != null || bool(specialist?.graphChecked) || bool(specialist?.graph?.analyzed);

  const bundledSupplyPct = specialistNumber(specialist, "bundledSupplyPct", "bundle");
  const sniperSupplyPct = specialistNumber(specialist, "sniperSupplyPct", "snipers");
  const commonFunderSupplyPct = specialistNumber(specialist, "commonFunderSupplyPct", "funding");
  const freshWalletSupplyPct = specialistNumber(specialist, "freshWalletSupplyPct", "freshWallets");
  const bundleChecked = bool(specialist?.bundleChecked) || bool(specialist?.bundle?.analyzed);
  const sniperChecked = bool(specialist?.sniperChecked) || bool(specialist?.snipers?.analyzed);
  const fundingChecked = bool(specialist?.fundingChecked) || bool(specialist?.funding?.analyzed);

  const rugRiskRows: any[] = Array.isArray(rug?.risks) ? rug.risks : [];
  for (const risk of rugRiskRows) {
    const level = String(risk?.level || "").toLowerCase();
    if (level === "danger" || level === "warn") {
      flags.push(`RugCheck ${level}: ${risk?.name || risk?.description || "risk"}`);
    }
  }

  if (rug?.rugged === true) flags.push("RugCheck marks token as rugged");
  if ((graphInsiderWallets || 0) >= WALLET_LIMITS.graphInsiderWallets) {
    flags.push(`${graphInsiderWallets} linked insider wallets detected`);
  }
  if ((insiderSupplyPct || 0) > WALLET_LIMITS.insiderSupplyPct) {
    flags.push(`linked insiders control ${insiderSupplyPct?.toFixed(1)}%`);
  }
  if ((bundledSupplyPct || 0) > WALLET_LIMITS.bundledSupplyPct) {
    flags.push(`bundled supply ${bundledSupplyPct?.toFixed(1)}%`);
  }
  if ((sniperSupplyPct || 0) > WALLET_LIMITS.sniperSupplyPct) {
    flags.push(`sniper supply ${sniperSupplyPct?.toFixed(1)}%`);
  }
  if ((commonFunderSupplyPct || 0) > WALLET_LIMITS.commonFunderSupplyPct) {
    flags.push(`common-funder cluster ${commonFunderSupplyPct?.toFixed(1)}%`);
  }
  if ((freshWalletSupplyPct || 0) > WALLET_LIMITS.freshWalletSupplyPct) {
    flags.push(`fresh-wallet cluster ${freshWalletSupplyPct?.toFixed(1)}%`);
  }

  const risky = flags.length > 0;
  const complete = graphChecked && bundleChecked && sniperChecked && fundingChecked;
  const verification = risky ? "RISKY" : complete ? "CLEAN" : "UNKNOWN";
  if (!complete && !risky) {
    const missing = [
      !graphChecked && "graph",
      !bundleChecked && "bundle",
      !sniperChecked && "sniper",
      !fundingChecked && "common-funder",
    ].filter(Boolean).join(", ");
    flags.push(`verification incomplete: ${missing}`);
  }

  return {
    verification,
    provider: specialist ? "RugCheck + specialist gateway" : "RugCheck",
    checkedAt: Date.now(),
    graphChecked,
    bundleChecked,
    sniperChecked,
    fundingChecked,
    rugged: rug?.rugged,
    rugcheckScore: n(rug?.score_normalised) ?? n(rug?.score),
    graphInsiderWallets,
    insiderSupplyPct,
    bundledSupplyPct,
    sniperSupplyPct,
    commonFunderSupplyPct,
    freshWalletSupplyPct,
    mintAuthorityRevoked: rug ? (rug?.token?.mintAuthority ?? rug?.mintAuthority) == null : undefined,
    freezeAuthorityRevoked: rug ? (rug?.token?.freezeAuthority ?? rug?.freezeAuthority) == null : undefined,
    flags,
    excludedTokenAccounts: poolTokenAccounts(rug, mint),
  };
}
