import { describe, expect, it } from "vitest";
import { firstPairLaunchesFromRows } from "@/lib/stonk";

const PEPE = "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m";
const BLACKBERRY = "BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy";

describe("historical real-pair launch regression", () => {
  it("replays the PEPE feed shape without falsely treating FEELSGOOD as launch #1", () => {
    const rows = [
      { mint: "HgcxVs6kJhPAaGqnPNGaa7zYgNT49hJrLufiqcNMuYZT", name: "Feels Good Man", symbol: "FEELSGOOD",
        quote: { mint: PEPE }, createdAt: "2026-09-18T21:30:47.922Z" },
      { mint: "2RRLzRjKRLGeFXZN3LZe8hgDzPh3gxMWP6bBRzqNSTQ2", name: "KEKIUS MAXIMUS", symbol: "KEKIUS",
        quote: { mint: PEPE }, createdAt: "2026-09-18T21:21:08.245Z" },
      { mint: "2mUouHn4iUWbveoFepQNoUo883CDmJL5XavqQ3e2HRJ9", name: "Pumpe", symbol: "PUMPE",
        quote: { mint: PEPE }, createdAt: "2026-09-18T21:21:08.245Z" },
      { mint: "2caKss5QLfDwnn7Sr34AQd85NmFyxoBeT2NuSoRSddyP", name: "EPEP", symbol: "EPEP",
        quote: { mint: PEPE }, createdAt: "2026-09-18T21:21:08.245Z" },
    ];
    const first = firstPairLaunchesFromRows(rows, 0, 3);
    expect(first).toHaveLength(3);
    expect(first.map(row => row.mint)).not.toContain("HgcxVs6kJhPAaGqnPNGaa7zYgNT49hJrLufiqcNMuYZT");
    expect(first.every(row => row.quote?.mint === PEPE)).toBe(true);
  });

  it("replays the BlackBerry first-launch burst and returns exactly #1-#3", () => {
    // Snapshot captured from the live STONK quote feed on 2026-09-20.
    const rows = [
      { mint: "2BfNhvG7AQuibA7pZsJywSYPDwAhVZdUX7pzAfjy4C8s", name: "BlackBerry", symbol: "BB",
        quote: { mint: BLACKBERRY }, createdAt: "2026-09-19T16:06:19.729Z" },
      { mint: "1ABvDeUV4qjo1MjoAts4ieXTZQhALW2Ppw324bHWkos", name: "Blackberry-Chan", symbol: "BB-Chan",
        quote: { mint: BLACKBERRY }, createdAt: "2026-09-19T16:06:19.729Z" },
      { mint: "12GLirh8ij7YXgQYgT74cL2EwzPU1uSdp3QfDAeAsLnC", name: "RIMCOIN", symbol: "RIM",
        quote: { mint: BLACKBERRY }, createdAt: "2026-09-19T16:06:19.729Z" },
    ];
    const first = firstPairLaunchesFromRows(rows, Date.parse("2026-09-19T16:06:00Z"), 3);
    expect(first.map(row => row.name)).toEqual(["RIMCOIN", "Blackberry-Chan", "BlackBerry"]);
    expect(first.every(row => row.quote?.mint === BLACKBERRY)).toBe(true);
  });
});
