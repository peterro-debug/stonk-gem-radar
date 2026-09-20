const BASE = "https://www.stonkfun.xyz/api/public/v1";
const cases = [
  { label: "PEPE", mint: "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m", minChildren: 3 },
  { label: "BLACKBERRY", mint: "BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy", minChildren: 1 },
];

async function get(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function firstChildren(mint) {
  const firstUrl = `${BASE}/tokens?quoteMint=${encodeURIComponent(mint)}&sort=newest&page=1&pageSize=100`;
  const first = await get(firstUrl);
  const firstRows = first?.data?.tokens || [];
  const total = Number(first?.data?.pagination?.total ?? firstRows.length);
  const lastPage = Math.max(1, Math.ceil(total / 100));
  const rows = [...firstRows];
  // Earliest entries live on the last page of newest-first pagination.
  if (lastPage > 1) {
    for (let page = lastPage; page >= Math.max(1, lastPage - 2); page--) {
      const body = await get(`${BASE}/tokens?quoteMint=${encodeURIComponent(mint)}&sort=newest&page=${page}&pageSize=100`);
      rows.push(...(body?.data?.tokens || []));
    }
  }
  return {
    total,
    rows: [...new Map(rows.map(r => [r.mint, r])).values()]
      .filter(r => r?.mint && r?.quote?.mint === mint && Number.isFinite(Date.parse(r.createdAt || "")))
      .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.mint.localeCompare(b.mint))
      .slice(0,3),
  };
}

let failed = false;
for (const c of cases) {
  try {
    const r = await firstChildren(c.mint);
    console.log(`\n=== ${c.label} ===`);
    console.log(`quoteMint=${c.mint} total=${r.total}`);
    r.rows.forEach((x,i) => console.log(`#${i+1} ${x.name || x.symbol || "?"} | ${x.mint} | ${x.createdAt} | quote=${x.quote?.mint}`));
    if (r.rows.length < c.minChildren) throw new Error(`expected >=${c.minChildren} child launches, got ${r.rows.length}`);
    if (r.rows.some(x => x.quote?.mint !== c.mint)) throw new Error("quote mismatch");
    if (c.label === "PEPE") {
      const feels = r.rows.findIndex(x => /FEELSGOOD|FEELS GOOD/i.test(`${x.name || ""} ${x.symbol || ""}`));
      console.log(`FEELSGOOD_rank=${feels >= 0 ? feels + 1 : "not-in-first-3"}`);
    }
  } catch (e) {
    failed = true;
    console.error(`${c.label} FAILED:`, e instanceof Error ? e.message : e);
  }
}
if (failed) process.exit(1);
