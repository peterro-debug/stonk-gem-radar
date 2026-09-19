import { NextRequest, NextResponse } from "next/server";
import { ensureHeliusWebhook } from "@/lib/helius-webhook";
import { getTelegramBotInfo, resolveTelegramChatId, sendTelegram } from "@/lib/telegram";
import { ensurePairMonitor } from "@/lib/ensure-pair-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.RADAR_ADMIN_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown setup error";
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const required = [
    "HELIUS_API_KEY",
    "HELIUS_WEBHOOK_AUTH_SECRET",
    "TELEGRAM_BOT_TOKEN",
  ].filter((name) => !process.env[name]);

  if (required.length) {
    return NextResponse.json({ error: "missing configuration", missing: required }, { status: 503 });
  }

  let helius: Awaited<ReturnType<typeof ensureHeliusWebhook>> | { error: string };
  try {
    helius = await ensureHeliusWebhook(req.nextUrl.origin);
  } catch (error) {
    helius = { error: safeError(error) };
  }

  let telegram: { ok: true; botUsername: string; chatId: string } | { ok: false; botUsername?: string; error: string };
  let botUsername: string | undefined;
  try {
    const bot = await getTelegramBotInfo();
    botUsername = bot.username;
    const chatId = await resolveTelegramChatId();
    await sendTelegram(
      "✅ Stonk Gem Radar er aktivert. Helius-webhook og Telegram-varsling er koblet til produksjon.",
    );
    telegram = { ok: true, botUsername: bot.username, chatId };
  } catch (error) {
    telegram = { ok: false, botUsername, error: safeError(error) };
  }

  let monitor;
  try { monitor = await ensurePairMonitor(); }
  catch (error) { monitor = { error: safeError(error) }; }
  const ok = !("error" in helius) && telegram.ok && !("error" in monitor);
  return NextResponse.json({ ok, helius, telegram, monitor }, { status: ok ? 200 : 207 });
}
