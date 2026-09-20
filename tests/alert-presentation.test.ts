import { describe, expect, it } from "vitest";
import { formatAlert } from "@/lib/format";
import { telegramPresentation } from "@/lib/telegram";
import { verifiedSnapshot } from "./fixtures/snapshot";

describe("concise Telegram decisions", () => {
  it("cannot present an incomplete high-score snapshot as approved", () => {
    const s = verifiedSnapshot(); s.narrative.score = 2; s.wallet.verification = "UNKNOWN";
    s.wallet.gmgn = { status: "incomplete", sampledWallets: 99, expectedWallets: 410,
      coverageComplete: false, missing: ["holder coverage"], observedSupplyPct: {} };
    const text = formatAlert(s, { demo: true });
    expect(text).toContain("TEST · AVVENT");
    expect(text).toContain("krever minst 3/5");
    expect(text).toContain("walletdekning 99/410");
    expect(text).not.toContain("kontroller bestått");
    expect(text).not.toContain("/100");
    expect(text.length).toBeLessThan(600);
  });
  it("retains the concrete risk and withdrawn-signal status", () => {
    const s = verifiedSnapshot(); s.status = "INVALIDATED"; s.wallet.verification = "RISKY";
    s.wallet.bundledSupplyPct = 25;
    const text = formatAlert(s);
    expect(text).toContain("RISIKOVARSEL");
    expect(text).toContain("bundles 25.0%");
    expect(text).toContain("Tidligere signal er trukket tilbake");
  });
  it("escapes token-supplied markup and links/copies the exact mint", () => {
    const mint = "HgcxVs6kJhPAaGqnPNGaa7zYgNT49hJrLufiqcNMuYZT";
    const body = telegramPresentation('Token <b>FAKE</b> & test\nLine <script>', mint);
    expect(body.text).toBe('<b>Token &lt;b&gt;FAKE&lt;/b&gt; &amp; test</b>\nLine &lt;script&gt;');
    expect(body.reply_markup?.inline_keyboard[0][0].url).toBe(`https://www.stonkfun.xyz/token/${mint}`);
    expect(body.reply_markup?.inline_keyboard[0][2].copy_text?.text).toBe(mint);
    expect(telegramPresentation("test", "invalid mint").reply_markup).toBeUndefined();
  });
});
