import { WALLET_LIMITS } from "./constants";
import type { WalletRiskMetrics } from "./types";
import { getSolanaTrackerEvidence } from "./solana-tracker";
import { authorityRevoked, count, isFresh, percentage } from "./risk-validation";
import { missingWalletChecks, walletThresholdRisks } from "./alert-policy";
import { getGmgnReport, parseGmgnEvidence } from "./gmgn";

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
      signal: AbortSignal.timeout(10_000),
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
      signal: AbortSignal.timeout(10_000),
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
  return percentage(report?.[key]) ?? percentage(report?.[nestedKey]?.supplyPct) ?? percentage(report?.[nestedKey]?.pct);
}

export async function getWalletRiskMetrics(mint: string, launchedAt: number, knownPoolAccounts: string[] = []): Promise<WalletRiskMetrics> {
  const [rugResponse, specialistResponse, tracker, gmgnReport] = await Promise.all([
    rugCheckReport(mint),
    specialistReport(mint, launchedAt),
    getSolanaTrackerEvidence(mint),
    getGmgnReport(mint),
  ]);
  const now = Date.now();
  const rug = rugResponse?.mint === mint ? rugResponse : undefined;
  const excludedTokenAccounts = [...new Set([...knownPoolAccounts, ...poolTokenAccounts(rug, mint)])];
  const gmgn = parseGmgnEvidence(mint, launchedAt, gmgnReport, excludedTokenAccounts, now);
  const specialist = specialistResponse?.mint === mint && isFresh(specialistResponse?.checkedAt, now)
    ? specialistResponse : undefined;
  const max = (...values: Array<number | undefined>) => {
    const valid = values.filter((v): v is number => v != null);
    return valid.length ? Math.max(...valid) : undefined;
  };

  const flags: string[] = [];
  const warnings: string[] = [];
  const supply = n(rug?.token?.supply);
  const networks: any[] = Array.isArray(rug?.insiderNetworks) ? rug.insiderNetworks : [];
  const insiderRaw = networks.reduce((sum, network) => sum + (n(network?.tokenAmount) || 0), 0);
  const graphInsiderWallets = count(rug?.graphInsidersDetected);
  const networkComplete = Array.isArray(rug?.insiderNetworks) && networks.every(network => n(network?.tokenAmount) != null && n(network.tokenAmount)! >= 0);
  const rugInsiderPct = supply && supply > 0 && networkComplete ? percentage((insiderRaw / supply) * 100) : undefined;
  const insiderSupplyPct = max(rugInsiderPct, tracker.insiderSupplyPct, gmgn.insiderSupplyPct, percentage(specialist?.insiderSupplyPct));
  const graphChecked = (graphInsiderWallets != null && rugInsiderPct != null)
    || tracker.insiderSupplyPct != null
    || gmgn.insiderSupplyPct != null
    || ((bool(specialist?.graphChecked) || bool(specialist?.graph?.analyzed)) && percentage(specialist?.insiderSupplyPct) != null);

  const bundledSupplyPct = max(specialistNumber(specialist, "bundledSupplyPct", "bundle"), tracker.bundledSupplyPct, gmgn.bundledSupplyPct);
  const sniperSupplyPct = max(specialistNumber(specialist, "sniperSupplyPct", "snipers"), tracker.sniperSupplyPct, gmgn.sniperSupplyPct);
  const commonFunderSupplyPct = max(specialistNumber(specialist, "commonFunderSupplyPct", "funding"), gmgn.commonFunderSupplyPct);
  const freshWalletSupplyPct = max(specialistNumber(specialist, "freshWalletSupplyPct", "freshWallets"), gmgn.freshWalletSupplyPct);
  const bundleChecked = tracker.bundledSupplyPct != null || gmgn.bundledSupplyPct != null || ((bool(specialist?.bundleChecked) || bool(specialist?.bundle?.analyzed)) && bundledSupplyPct != null);
  const sniperChecked = tracker.sniperSupplyPct != null || gmgn.sniperSupplyPct != null || ((bool(specialist?.sniperChecked) || bool(specialist?.snipers?.analyzed)) && sniperSupplyPct != null);
  // Insider detection is not proof that all early buyers' funding paths were checked.
  const fundingChecked = gmgn.commonFunderSupplyPct != null || ((bool(specialist?.fundingChecked) || bool(specialist?.funding?.analyzed)) && commonFunderSupplyPct != null);

  const rugRiskRows: any[] = Array.isArray(rug?.risks) ? rug.risks : [];
  for (const risk of rugRiskRows) {
    const level = String(risk?.level || "").toLowerCase();
    if (level === "danger" || level === "warn" || level === "warning") {
      flags.push(`RugCheck ${level}: ${risk?.name || risk?.description || "risk"}`);
    }
  }

  if (rug?.rugged === true) flags.push("RugCheck marks token as rugged");
  if ((graphInsiderWallets || 0) >= WALLET_LIMITS.graphInsiderWallets) {
    warnings.push(`${graphInsiderWallets} graph-linked wallets; concentration, not count, determines the risk gate`);
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

  const authority = (field: string, trackerValue: boolean | undefined) => {
    const gmgnValue = field === "mintAuthority" ? gmgn.mintAuthorityRevoked : gmgn.freezeAuthorityRevoked;
    const values = [authorityRevoked(rug?.token, field), authorityRevoked(rug, field), trackerValue, gmgnValue];
    return values.includes(false) ? false : values.includes(true) ? true : undefined;
  };
  const result: WalletRiskMetrics = {
    verification: "UNKNOWN",
    provider: [rug && "RugCheck", tracker.checkedAt && "Solana Tracker", gmgn.checkedAt && "GMGN", specialist && "specialist gateway"].filter(Boolean).join(" + ") || "unavailable",
    checkedAt: Math.min(now, tracker.checkedAt ?? now, gmgn.checkedAt ?? now, specialist?.checkedAt ?? now),
    graphChecked,
    bundleChecked,
    sniperChecked,
    fundingChecked,
    rugged: rug?.rugged === true || tracker.rugged === true,
    rugcheckScore: n(rug?.score_normalised) ?? n(rug?.score),
    graphInsiderWallets,
    insiderSupplyPct,
    bundledSupplyPct,
    sniperSupplyPct,
    commonFunderSupplyPct,
    freshWalletSupplyPct,
    mintAuthorityRevoked: authority("mintAuthority", tracker.mintAuthorityRevoked),
    freezeAuthorityRevoked: authority("freezeAuthority", tracker.freezeAuthorityRevoked),
    flags,
    warnings,
    excludedTokenAccounts,
    initialBundledSupplyPct: tracker.initialBundledSupplyPct,
    trackerStatus: tracker.status,
    trackerError: tracker.error,
    trackerRiskScore: tracker.riskScore,
    gmgn: { status: gmgn.status, error: gmgn.error, sampledWallets: gmgn.sampledWallets,
      checkedAt: gmgn.checkedAt, sampleValid: gmgn.sampleValid, sampledSupplyPct: gmgn.sampledSupplyPct,
      largestObservedHolderPct: gmgn.largestObservedHolderPct, top10ObservedPct: gmgn.top10ObservedPct,
      expectedWallets: gmgn.expectedWallets, coverageComplete: gmgn.coverageComplete,
      missing: gmgn.missing, observedSupplyPct: gmgn.observed },
  };
  flags.push(...tracker.flags, ...gmgn.flags, ...walletThresholdRisks(result));
  const missing = missingWalletChecks(result, now);
  result.verification = flags.length ? "RISKY" : missing.length ? "UNKNOWN" : "CLEAN";
  result.flags = [...new Set(flags)];
  if (result.verification === "UNKNOWN") result.flags.push(`verification incomplete: ${missing.join(", ")}`);
  return result;
}
