import { describe, expect, it } from "vitest";
import { findTelegramChatId } from "@/lib/telegram";

describe("Telegram chat resolution", () => {
  const start = (id: number, username: string) => ({
    message: { text: "/start", chat: { id, type: "private", username } },
  });

  it("prefers the configured username", () => {
    expect(findTelegramChatId([start(1, "other"), start(2, "PelleSuper")], "@pellesuper")).toBe("2");
  });

  it("uses the only private start when the username differs", () => {
    expect(findTelegramChatId([start(42, "actual_username")], "PelleSuper")).toBe("42");
  });

  it("does not guess when several private users have started the bot", () => {
    expect(findTelegramChatId([start(1, "one"), start(2, "two")], "missing")).toBeUndefined();
  });
});
