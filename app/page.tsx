export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 760, margin: "60px auto", padding: 24 }}>
      <h1>Stonk Gem Radar</h1>
      <p>Event-driven StonkFun scanner. New launches start a 20-minute LinkedInu recheck workflow and only qualified status changes are pushed to Telegram.</p>
      <p>Health: <code>/api/health</code></p>
    </main>
  );
}
