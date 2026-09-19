export const EVIDENCE_MAX_AGE_MS = 5 * 60_000;

export function numberValue(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function percentage(value: unknown): number | undefined {
  const n = numberValue(value);
  return n != null && n >= 0 && n <= 100 ? n : undefined;
}

export function count(value: unknown): number | undefined {
  const n = numberValue(value);
  return n != null && Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function isFresh(at: unknown, now: number): boolean {
  const n = numberValue(at);
  return n != null && n > 0 && n <= now + 30_000 && now - n <= EVIDENCE_MAX_AGE_MS;
}

// A missing field is not evidence that an authority has been revoked.
export function authorityRevoked(record: any, field: string): boolean | undefined {
  if (!record || !Object.hasOwn(record, field)) return undefined;
  if (record[field] === null) return true;
  if (typeof record[field] === "string" && record[field].length > 0) return false;
  return undefined;
}
