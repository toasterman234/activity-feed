#!/usr/bin/env node
/**
 * merge-tweakcn.ts — Merge tweakcn-inspired themes into tokens.json
 *
 * Usage: npx tsx themes/merge-tweakcn.ts
 *
 * Reads themes/tokens.json, imports new themes from themes/tweakcn-themes.ts,
 * merges them in, writes tokens.json back, then regenerates CSS.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TOKENS_PATH = path.join(ROOT, "tokens.json");

// Dynamic import of the TS module
import { NEW_THEMES } from "./tweakcn-themes.js";

function merge() {
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
  let added = 0;
  let updated = 0;

  for (const [key, theme] of Object.entries(NEW_THEMES) as [string, any][]) {
    if (tokens[key]) {
      // Update existing
      tokens[key] = { ...tokens[key], ...theme };
      updated++;
    } else {
      tokens[key] = theme;
      added++;
    }
  }

  // Pretty-print with 2-space indent
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + "\n");

  console.log(`✓ tokens.json updated: ${added} added, ${updated} updated`);
  console.log(`  Themes now: ${Object.keys(tokens).length}`);
  console.log(`\n  Next: run 'npm run gen:themes' to regenerate CSS`);
}

merge();
