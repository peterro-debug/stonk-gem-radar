import type { HolderMetrics, TokenMeta } from "./types";

function apiKey(): string {
  const v = process.env.HELIUS_API_KEY;
  if (!v) throw new Error("Missing HELIUS_API_KEY");
  return v;
}

async function rpc(method: string, params: unknown): Promise<any> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "stonk-radar", method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Helius RPC ${method} failed: ${res.status}`);
  const data = await res.json() as any;
  if (data.error) throw new Error(`Helius RPC ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

export async function getTokenMeta(mint: string): Promise<TokenMeta> {
  try {
    const asset = await rpc("getAsset", { id: mint, displayOptions: { showFungible: true } });
    return {
      name: asset?.content?.metadata?.name || asset?.token_info?.symbol,
      symbol: asset?.content?.metadata?.symbol || asset?.token_info?.symbol,
      image: asset?.content?.links?.image,
      decimals: asset?.token_info?.decimals,
    };
  } catch {
    return {};
  }
}

export async function getHolderMetrics(
  mint: string,
  opts: { excludeTokenAccounts?: string[]; creator?: string } = {},
): Promise<HolderMetrics> {
  const owners = new Map<string, bigint>();
  const excludedAccounts = new Set(opts.excludeTokenAccounts || []);
  let page = 1;
  let total = 0n;
  let sampleComplete = false;
  let sampledAccounts = 0;
  const seenAccounts = new Set<string>();

  while (page <= 6) {
    const result = await rpc("getTokenAccounts", {
      page,
      limit: 1000,
      displayOptions: {},
      mint,
    });
    if (!Array.isArray(result?.token_accounts)) throw new Error("Incomplete Helius holder response");
    const accounts: any[] = result.token_accounts;
    sampledAccounts += accounts.length;
    if (!accounts.length) { sampleComplete = true; break; }
    for (const a of accounts) {
      if (!a?.address || seenAccounts.has(a.address)) continue;
      seenAccounts.add(a.address);
      if (!a?.owner || excludedAccounts.has(a.address)) continue;
      const amount = BigInt(String(a.amount || "0"));
      if (amount <= 0n) continue;
      owners.set(a.owner, (owners.get(a.owner) || 0n) + amount);
      total += amount;
    }
    if (accounts.length < 1000) { sampleComplete = true; break; }
    page += 1;
  }

  const balances = [...owners.entries()].sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1));
  const pct = (n: bigint) => total > 0n && sampleComplete
    ? Number((n * 1_000_000n) / total) / 10_000 : undefined;
  const top10 = balances.slice(0, 10).reduce((s, [, a]) => s + a, 0n);
  const creatorBal = opts.creator ? owners.get(opts.creator) || 0n : 0n;

  return {
    checkedAt: Date.now(),
    holders: owners.size,
    top10Pct: pct(top10),
    largestPct: balances.length ? pct(balances[0][1]) : undefined,
    creatorPct: opts.creator ? pct(creatorBal) : undefined,
    excludedPoolAccounts: excludedAccounts.size,
    sampleComplete,
    sampledAccounts,
    poolExclusionKnown: excludedAccounts.size > 0,
  };
}

export async function getTraderMetrics(
  poolState: string,
  mint: string,
  baseVault: string | undefined,
  launchedAtMs: number,
): Promise<import("./types").TraderMetrics> {
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${poolState}/transactions?api-key=${apiKey()}&limit=100`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return {};
    const txs = await res.json() as any[];
    const buyers = new Set<string>();
    const sellers = new Set<string>();
    let swaps = 0;
    const since = Math.max(launchedAtMs, Date.now() - 5 * 60_000);

    for (const tx of txs || []) {
      const ts = Number(tx?.timestamp || 0) * 1000;
      if (!ts || ts < since) continue;
      const transfers: any[] = tx?.tokenTransfers || [];
      let touched = false;
      for (const t of transfers) {
        if (t?.mint !== mint) continue;
        if (baseVault) {
          if (t?.fromTokenAccount === baseVault) {
            const wallet = t?.toUserAccount || tx?.feePayer;
            if (wallet) buyers.add(wallet);
            touched = true;
          }
          if (t?.toTokenAccount === baseVault) {
            const wallet = t?.fromUserAccount || tx?.feePayer;
            if (wallet) sellers.add(wallet);
            touched = true;
          }
          continue;
        }
        // API-discovered Stonk launches do not always include the token vault.
        // For those, enhanced-transfer ownership plus the transaction fee payer
        // gives a conservative wallet-direction fallback: the fee payer receiving
        // the target token is a buyer; sending it is a seller.
        const wallet = tx?.feePayer;
        if (!wallet) continue;
        if (t?.toUserAccount === wallet && t?.fromUserAccount !== wallet) {
          buyers.add(wallet);
          touched = true;
        }
        if (t?.fromUserAccount === wallet && t?.toUserAccount !== wallet) {
          sellers.add(wallet);
          touched = true;
        }
      }
      if (touched) swaps += 1;
    }
    return {
      checkedAt: Date.now(),
      windowMinutes: 5,
      uniqueBuyers: buyers.size,
      uniqueSellers: sellers.size,
      uniqueTraders: new Set([...buyers, ...sellers]).size,
      sampledSwaps: swaps,
      directionMethod: baseVault ? "vault" : "fee-payer",
      approximate: !baseVault,
    };
  } catch {
    return {};
  }
}
