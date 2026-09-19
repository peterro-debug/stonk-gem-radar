import { LAUNCHLAB_PROGRAM, STONK_CONFIGS } from "./constants";
import type { Launch } from "./types";

function keyString(k: any): string {
  if (typeof k === "string") return k;
  return k?.pubkey || k?.toString?.() || "";
}

function allKeys(raw: any): string[] {
  const msg = raw?.transaction?.transaction?.message || raw?.transaction?.message || raw?.message;
  const base = (msg?.accountKeys || msg?.staticAccountKeys || []).map(keyString);
  const loaded = raw?.transaction?.meta?.loadedAddresses || raw?.meta?.loadedAddresses;
  return [...base, ...(loaded?.writable || []).map(keyString), ...(loaded?.readonly || []).map(keyString)];
}

function allInstructions(raw: any): any[] {
  const msg = raw?.transaction?.transaction?.message || raw?.transaction?.message || raw?.message;
  const outer = msg?.instructions || msg?.compiledInstructions || [];
  const meta = raw?.transaction?.meta || raw?.meta;
  const inner = (meta?.innerInstructions || []).flatMap((g: any) => g?.instructions || []);
  return [...outer, ...inner];
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(input: string): Uint8Array {
  if (!input) return new Uint8Array();
  const bytes = [0];
  for (const ch of input) {
    const val = B58.indexOf(ch);
    if (val < 0) throw new Error("invalid base58");
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < input.length - 1 && input[i] === "1"; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

const INIT_V2 = [67, 153, 175, 39, 218, 16, 38, 32];
const INIT_TOKEN_2022 = [37, 190, 126, 222, 44, 154, 171, 17];

function isInitialize(ix: any): boolean {
  try {
    const raw = ix?.data;
    let bytes: Uint8Array;
    if (typeof raw === "string") bytes = decodeBase58(raw);
    else if (raw instanceof Uint8Array) bytes = raw;
    else if (Array.isArray(raw)) bytes = Uint8Array.from(raw);
    else return false;
    if (bytes.length < 8) return false;
    const head = Array.from(bytes.slice(0, 8));
    return INIT_V2.every((v, i) => head[i] === v) || INIT_TOKEN_2022.every((v, i) => head[i] === v);
  } catch {
    return false;
  }
}

function instructionAccounts(ix: any, keys: string[]): string[] {
  const accs = ix?.accounts || ix?.accountKeyIndexes || [];
  return accs.map((a: any) => typeof a === "number" ? keys[a] : keyString(a));
}

function programId(ix: any, keys: string[]): string {
  if (ix?.programId) return keyString(ix.programId);
  if (typeof ix?.programIdIndex === "number") return keys[ix.programIdIndex] || "";
  return "";
}

function signature(raw: any): string {
  return raw?.signature || raw?.transaction?.signature || raw?.transaction?.transaction?.signatures?.[0] || raw?.transaction?.signatures?.[0] || "unknown";
}

export function parseStonkLaunches(payload: unknown): Launch[] {
  const rows = Array.isArray(payload) ? payload : [payload];
  const out: Launch[] = [];

  for (const raw of rows as any[]) {
    const keys = allKeys(raw);
    if (!keys.length) continue;
    for (const ix of allInstructions(raw)) {
      if (programId(ix, keys) !== LAUNCHLAB_PROGRAM) continue;
      if (!isInitialize(ix)) continue;
      const a = instructionAccounts(ix, keys);
      // initialize_with_token_2022 account layout documented for StonkFun:
      // 0 payer, 1 creator, 3 platform config, 5 pool, 6 base mint, 7 quote mint, 8/9 vaults.
      if (a.length < 10 || !STONK_CONFIGS.has(a[3])) continue;
      if (!a[6] || !a[7] || a[6] === a[7]) continue;

      out.push({
        signature: signature(raw),
        launchedAt: (() => {
          const t = Number(raw?.timestamp || raw?.blockTime || raw?.transaction?.blockTime || Date.now());
          return t > 10_000_000_000 ? t : t * 1000;
        })(),
        creator: a[1],
        platformConfig: a[3],
        poolState: a[5],
        mint: a[6],
        quoteMint: a[7],
        baseVault: a[8],
        quoteVault: a[9],
      });
    }
  }

  const uniq = new Map(out.map((x) => [`${x.signature}:${x.mint}`, x]));
  return [...uniq.values()];
}
