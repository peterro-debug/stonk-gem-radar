const TG_API = "https://api.telegram.org";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export type TelegramBotInfo = {
  id: number;
  username: string;
};

export function findTelegramChatId(updates: any[], username?: string): string | undefined {
  const wanted = username?.replace(/^@/, "").toLowerCase();
  const privateChats: Array<{ chatId: string; username: string }> = [];
  const starts: Array<{ chatId: string; username: string }> = [];

  for (let i = updates.length - 1; i >= 0; i--) {
    const msg = updates[i]?.message || updates[i]?.edited_message;
    const chat = msg?.chat;
    const text = String(msg?.text || "");
    if (!chat?.id || chat?.type !== "private") continue;

    const candidate = {
      chatId: String(chat.id),
      username: String(chat.username || "").toLowerCase(),
    };
    if (wanted && candidate.username === wanted) return candidate.chatId;
    if (!privateChats.some((entry) => entry.chatId === candidate.chatId)) privateChats.push(candidate);
    if (/^\/start(?:\s|$)/i.test(text) && !starts.some((entry) => entry.chatId === candidate.chatId)) {
      starts.push(candidate);
    }
  }

  if (starts.length === 1) return starts[0].chatId;
  return privateChats.length === 1 ? privateChats[0].chatId : undefined;
}

export async function getTelegramBotInfo(): Promise<TelegramBotInfo> {
  const token = required("TELEGRAM_BOT_TOKEN");
  const res = await fetch(`${TG_API}/bot${token}/getMe`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Telegram getMe failed: ${res.status}`);
  const body = await res.json() as { ok?: boolean; result?: { id?: number; username?: string } };
  if (!body.ok || !body.result?.id || !body.result.username) {
    throw new Error("Telegram returned an invalid bot profile");
  }
  return { id: body.result.id, username: body.result.username };
}

export async function resolveTelegramChatId(): Promise<string> {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const token = required("TELEGRAM_BOT_TOKEN");
  const wanted = process.env.TELEGRAM_USERNAME || "PelleSuper";
  const res = await fetch(`${TG_API}/bot${token}/getUpdates?limit=100`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Telegram getUpdates failed: ${res.status}`);
  const body = await res.json() as any;
  const updates: any[] = body.result || [];
  const chatId = findTelegramChatId(updates, wanted);
  if (chatId) return chatId;
  throw new Error("No unique private Telegram chat update found");
}

export async function sendTelegram(text: string): Promise<void> {
  const token = required("TELEGRAM_BOT_TOKEN");
  const chatId = await resolveTelegramChatId();
  const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${detail.slice(0, 300)}`);
  }
}
