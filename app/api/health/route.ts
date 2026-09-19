import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    configured: {
      helius: Boolean(process.env.HELIUS_API_KEY),
      webhookAuth: Boolean(process.env.HELIUS_WEBHOOK_AUTH_SECRET),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      cronAuth: Boolean(process.env.CRON_SECRET || process.env.RADAR_ADMIN_SECRET),
      specialistWalletRisk: Boolean(process.env.WALLET_RISK_API_URL),
    },
    walletPolicy: "UNKNOWN is never CLEAN and cannot trigger GEM",
    scanModes: ["FLASH", "BUILD", "REAWAKENING"],
  });
}
