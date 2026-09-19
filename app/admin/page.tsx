"use client";

import { FormEvent, useState } from "react";

type SetupResult = {
  ok?: boolean;
  demo?: boolean;
  error?: string;
  missing?: string[];
  helius?: unknown;
  telegram?: unknown;
  [key: string]: unknown;
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"setup" | "demo" | "monitor" | "status" | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);

  async function runRequest(endpoint: string, action: "setup" | "demo" | "monitor" | "status") {
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch(endpoint, {
        method: action === "status" ? "GET" : "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      const body = await response.json() as SetupResult;
      setResult(body);
    } catch {
      setResult({ demo: action === "demo", error: "Kunne ikke kontakte endepunktet." });
    } finally {
      setBusy(null);
    }
  }

  async function runSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runRequest("/api/admin/setup", "setup");
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
        <button type="submit" disabled={busy !== null} style={{ font: "inherit", padding: 10, cursor: "pointer" }}>
          {busy === "setup" ? "Kobler til …" : "Koble Helius og Telegram"}
        </button>
        <button type="button" disabled={busy !== null || !secret}
          onClick={() => runRequest("/api/admin/monitor", "monitor")} style={{ font: "inherit", padding: 10 }}>
          {busy === "monitor" ? "Starter …" : "Start overvåkning av nye par"}
        </button>
        <button type="button" disabled={busy !== null || !secret}
          onClick={() => runRequest("/api/admin/monitor", "status")} style={{ font: "inherit", padding: 10 }}>
          {busy === "status" ? "Henter …" : "Vis kildestatus og siste parhendelser"}
        </button>
        <button
          type="button"
          disabled={busy !== null || !secret}
          onClick={() => runRequest("/api/admin/demo", "demo")}
          style={{ font: "inherit", padding: 10, cursor: "pointer" }}
        >
          {busy === "demo" ? "Henter og analyserer …" : "Kjør demo med ferske data"}
        </button>
      </form>
      <p>
        Demoen henter én aktuell StonkFun-kandidat, kjører hele analysemodellen og sender resultatet til Telegram.
        Den kjøper ingenting og starter ingen varig overvåkning.
      </p>
      <p>Parregisteret sjekkes omtrent hvert minutt. X krever egen lesetilgang; status viser siste vellykkede innhenting.
        Tidlige navnekandidater er hypoteser og gjennomgår fortsatt markeds- og risikosjekker.</p>
      {result && (
        <section aria-live="polite" style={{ marginTop: 24 }}>
          <h2>
            {result.demo
              ? result.ok ? "Demotest fullført" : "Demotest feilet"
              : result.ok ? "Forespørsel fullført" : "Trenger oppfølging"}
          </h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
