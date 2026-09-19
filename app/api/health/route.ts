import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    configured: {
      helius: Boolean(process.env.HELIUS_API_KEY),
      webhookAuth: Boolean(process.env.HELIUS_WEBHOOK_AUTH_SECRET),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
    },
  });
}
