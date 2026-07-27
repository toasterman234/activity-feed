#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const failures = [];

if (!/import BottomNav from ["']\.\/bottom-nav["'];/.test(layout)) {
  failures.push("RootLayout must import BottomNav");
}
if (!/<BottomNav\s*\/>/.test(layout)) {
  failures.push("RootLayout must mount BottomNav");
}
if (/<nav\b[^>]*\bsticky\b[^>]*\btop-0\b/.test(layout)) {
  failures.push("RootLayout must not render the obsolete sticky top navigation");
}

if (failures.length) {
  console.error("mobile-shell check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("✓ mobile-shell check passed (BottomNav mounted; no top nav)");
