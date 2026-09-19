"use client";

import { FormEvent, useState } from "react";

type SetupResult = {
  ok?: boolean;
  error?: string;
  missing?: string[];
  helius?: unknown;
  telegram?: unknown;
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);

  async function runSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      const body = await response.json() as SetupResult;
      setResult(body);
    } catch {
      setResult({ error: "Kunne ikke kontakte oppsett-endepunktet." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 680, margin: "60px auto", padding: 24 }}>
      <h1>Stonk Gem Radar – oppsett</h1>
      <p>Start Telegram-boten med <code>/start</code>, og kjør deretter det sikre engangsoppsettet.</p>
      <form onSubmit={runSetup} style={{ display: "grid", gap: 12 }}>
        <label htmlFor="admin-secret">Adminnøkkel</label>
        <input
          id="admin-secret"
          name="admin-secret"
          type="password"
          autoComplete="current-password"
          required
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          style={{ font: "inherit", padding: 10 }}
        />
        <button type="submit" disabled={busy} style={{ font: "inherit", padding: 10, cursor: "pointer" }}>
          {busy ? "Kobler til …" : "Koble Helius og Telegram"}
        </button>
      </form>
      {result && (
        <section aria-live="polite" style={{ marginTop: 24 }}>
          <h2>{result.ok ? "Oppsett fullført" : "Oppsett trenger oppfølging"}</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
