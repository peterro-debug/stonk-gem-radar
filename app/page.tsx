export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 760, margin: "60px auto", padding: 24 }}>
      <h1>Stonk Gem Radar</h1>
      <p>Event-driven StonkFun scanner with FLASH (0–6h), BUILD (6h–3d) and REAWAKENING (3–21d) monitoring.</p>
      <p>Only meaningful state changes are pushed to Telegram, and an unverified wallet graph can never be promoted to GEM.</p>
      <p>Health: <code>/api/health</code></p>
    </main>
  );
}
