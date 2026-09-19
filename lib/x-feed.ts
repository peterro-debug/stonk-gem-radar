export type XPost = { id: string; text: string; created_at: string; author_id?: string };
export type XCursor = {
  userId?: string;
  sinceId?: string;
  initialized?: boolean;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  status: "not-configured" | "active" | "error";
  error?: string;
};

export function xConfigured(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN && /^\d+$/.test(process.env.X_STONK_USER_ID || ""));
}

export async function pollOfficialX(previous: XCursor, now: number): Promise<{ cursor: XCursor; posts: XPost[] }> {
  if (!xConfigured()) return { cursor: { status: "not-configured" }, posts: [] };
  const userId = process.env.X_STONK_USER_ID!;
  const old = previous.userId === userId ? previous : { status: "not-configured" as const };
  if (old.lastAttemptAt && now - old.lastAttemptAt < 5 * 60_000) return { cursor: old, posts: [] };
  try {
    const posts: XPost[] = [];
    let next: string | undefined;
    for (let page = 0; page < 3; page++) {
      const params = new URLSearchParams({ max_results: "100", "tweet.fields": "created_at,author_id", exclude: "retweets,replies" });
      if (old.sinceId) params.set("since_id", old.sinceId);
      if (next) params.set("pagination_token", next);
      const res = await fetch(`https://api.x.com/2/users/${userId}/tweets?${params}`, {
        headers: { authorization: `Bearer ${process.env.X_BEARER_TOKEN}`, accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`X API HTTP ${res.status}`);
      const body = await res.json();
      if (body.errors?.length || (!Array.isArray(body.data) && body.meta?.result_count !== 0)) throw new Error("X timeline response incomplete");
      for (const post of body.data || []) {
        if (!/^\d+$/.test(post.id) || typeof post.text !== "string" || !Number.isFinite(Date.parse(post.created_at))
          || post.author_id !== userId) throw new Error("X post failed author/schema validation");
        posts.push(post);
      }
      next = body.meta?.next_token;
      // First connection establishes a baseline, without sending old posts.
      if (!old.initialized || !next) break;
    }
    if (old.initialized && next) throw new Error("X timeline backlog exceeds scan window; cursor retained");
    const sinceId = posts.reduce((id, post) => !id || BigInt(post.id) > BigInt(id) ? post.id : id, old.sinceId);
    return {
      cursor: { userId, initialized: true, sinceId, status: "active", lastAttemptAt: now, lastSuccessAt: now },
      posts: old.initialized ? posts.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) : [],
    };
  } catch (error) {
    return { cursor: { ...old, userId, lastAttemptAt: now, status: "error", error: error instanceof Error ? error.message : "X feed unavailable" }, posts: [] };
  }
}
