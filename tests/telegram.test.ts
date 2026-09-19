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

  it("uses the only private chat after a normal setup message", () => {
    const update = {
      message: { text: "setup", chat: { id: 77, type: "private", username: "actual_username" } },
    };
    expect(findTelegramChatId([update], "PelleSuper")).toBe("77");
  });

  it("matches the configured username on a normal private message", () => {
    const message = (id: number, username: string) => ({
      message: { text: "setup", chat: { id, type: "private", username } },
    });
    expect(findTelegramChatId([message(1, "other"), message(2, "PelleSuper")], "@pellesuper")).toBe("2");
  });

  it("does not guess when several private users have started the bot", () => {
    expect(findTelegramChatId([start(1, "one"), start(2, "two")], "missing")).toBeUndefined();
  });
});
