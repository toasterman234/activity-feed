#!/usr/bin/env node
/**
 * generate.ts — Read themes/tokens.json, write themes/generated.css
 *
 * Usage: npx tsx themes/generate.ts
 * Output: themes/generated.css
 *
 * The generated CSS is byte-identical to the theme declaration portion of
 * src/app/globals.css. Only the tokens-driven sections are generated; the
 * @import "tailwindcss" and @theme inline blocks are appended from a static
 * suffix file (themes/tailwind-suffix.css).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ThemeDefinition, ThemeRegistry } from "./types.js";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TOKENS_PATH = path.join(ROOT, "tokens.json");
const SUFFIX_PATH = path.join(ROOT, "tailwind-suffix.css");
const OUTPUT_PATH = path.join(ROOT, "generated.css");

function loadTokens(): ThemeRegistry {
  const raw = fs.readFileSync(TOKENS_PATH, "utf-8");
  return JSON.parse(raw) as ThemeRegistry;
}

/**
 * Emit a CSS custom property declaration line.
 * @param indent - leading whitespace before "--key"
 */
function prop(key: string, value: string, indent = "  "): string {
  return `${indent}--${key}: ${value};\n`;
}

/**
 * Emit a full rule block for a set of tokens.
 * @param indent - extra indent applied to property lines inside the block
 */
function ruleBlock(selector: string, tokens: Record<string, string>, indent = "  "): string {
  let css = `${selector} {\n`;
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined) {
      css += prop(key, value, indent);
    }
  }
  css += "}\n";
  return css;
}

/**
 * Emit a dark-mode override for a selector.
 */
function darkBlock(selector: string, tokens: Record<string, string>): string {
  if (Object.keys(tokens).length === 0) return "";
  return (
    "@media (prefers-color-scheme: dark) {\n" +
    ruleBlock(`  ${selector}`, tokens, "    ") +
    "}\n"
  );
}

function generate(): string {
  const registry = loadTokens();
  let css = "";

  // Header comment
  css += "/* ═══════════════════════════════════════════════════════════\n";
  css += "   Activity Dashboard — Theme Switcher (data-theme)\n";
  css += "   Generated from themes/tokens.json — DO NOT EDIT BY HAND\n";
  css += "   Regenerate: npx tsx themes/generate.ts\n";
  css += "   ═══════════════════════════════════════════════════════════ */\n\n";

  const defaultTheme = registry["default"];
  if (!defaultTheme) {
    throw new Error('Required theme "default" not found in tokens.json');
  }

  // ── DEFAULT (light) ──
  css += "/* ── THEME: DEFAULT (zinc, Arial, moderate) ── */\n";
  css += ruleBlock(":root", defaultTheme.light as Record<string, string>);
  css += "\n";

  // ── DEFAULT (dark) ──
  css += "/* Default dark */\n";
  if (defaultTheme.dark && !defaultTheme.darkAlways) {
    css += darkBlock(":root", defaultTheme.dark as Record<string, string>);
  }
  css += "\n";

  // ── Named themes ──
  for (const [id, theme] of Object.entries(registry)) {
    if (id === "default") continue;

    const selector = `[data-theme="${id}"]`;
    const emoji = theme.emoji ? ` ${theme.emoji}` : "";

    css += `/* ── THEME: ${theme.name.toUpperCase()} (${theme.description}) ── */\n`;
    css += ruleBlock(selector, theme.light as Record<string, string>);

    if (theme.darkAlways) {
      // Always-dark themes: note in dark media block that they're locked
      css += "@media (prefers-color-scheme: dark) {\n";
      css += `  [data-theme="${id}"] {\n`;
      css += `    /* ${theme.name} is always dark — same values, keeps it locked */\n`;
      css += "  }\n";
      css += "}\n";
    } else if (theme.dark && Object.keys(theme.dark).length > 0) {
      css += darkBlock(selector, theme.dark as Record<string, string>);
    }
    css += "\n";
  }

  // ── Tailwind and @theme inline suffix ──
  if (fs.existsSync(SUFFIX_PATH)) {
    css += fs.readFileSync(SUFFIX_PATH, "utf-8");
  }

  return css;
}

// Run
const output = generate();
fs.writeFileSync(OUTPUT_PATH, output, "utf-8");
console.log(`✅ Generated ${OUTPUT_PATH} (${Buffer.byteLength(output, "utf-8")} bytes)`);
