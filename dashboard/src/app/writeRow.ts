// Writes judgments/judgment_collections through the server route, which
// inserts directly into Postgres (the source of truth). Do not use the
// electric-circuits client's write() for these tables — see
// src/app/api/judgments/write/route.ts for why.
export async function writeRow(table: "judgment_collections" | "judgments", row: Record<string, unknown>) {
  const res = await fetch("/api/judgments/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, row }),
  });
  if (!res.ok) throw new Error(`writeRow ${table} failed: ${res.status}`);
  return res.json();
}

export async function deleteRow(table: "judgment_collections" | "judgments", id: string) {
  const res = await fetch("/api/judgments/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, op: "delete", id }),
  });
  if (!res.ok) throw new Error(`deleteRow ${table} failed: ${res.status}`);
  return res.json();
}
