#!/usr/bin/env node
/**
 * merge-tweakcn.mjs — Merge 15 tweakcn-inspired themes into tokens.json
 * Usage: node themes/merge-tweakcn.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(ROOT, "tokens.json");

// Style profiles — full typography/spacing/radii/motion
const S = {
  comfortable: {
    "font-body": '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    "font-display": '"Inter", -apple-system, sans-serif',
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "text-xs": "0.688rem","text-sm":"0.813rem","text-base":"0.875rem","text-lg":"1rem","text-xl":"1.125rem","text-2xl":"1.25rem","text-3xl":"1.5rem","text-4xl":"1.875rem",
    "leading-body":"1.5","leading-tight":"1.25","tracking-display":"-0.01em","meta":"0.625rem",
    "font-weight-normal":"400","font-weight-strong":"600","font-weight-display":"700",
    "letter-spacing-body":"normal","letter-spacing-display":"-0.01em",
    "space-1":"0.25rem","space-2":"0.5rem","space-3":"0.75rem","space-4":"1rem","space-5":"1.25rem","space-6":"1.5rem","space-8":"2rem","space-12":"3rem",
    "card-padding":"0.875rem","card-gap":"0.625rem","section-gap":"1rem",
    "radius-sm":"0.25rem","radius-md":"0.375rem","radius-lg":"0.5rem","radius-xl":"0.75rem","radius-pill":"9999px","radius-card":"0.5rem","radius-btn":"0.375rem",
    "elev-flat":"none","elev-raised":"none","elev-ring":"0 0 0 1px var(--border)","motion-base":"150ms","motion-fast":"100ms",
  },
  tight: {
    "font-body": '"Inter", -apple-system, sans-serif',
    "font-display": '"Inter", -apple-system, sans-serif',
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "text-xs":"0.625rem","text-sm":"0.6875rem","text-base":"0.75rem","text-lg":"0.8125rem","text-xl":"0.875rem","text-2xl":"0.9375rem","text-3xl":"1rem","text-4xl":"1.125rem",
    "leading-body":"1.35","leading-tight":"1.15","tracking-display":"0em","meta":"0.5625rem",
    "font-weight-normal":"400","font-weight-strong":"500","font-weight-display":"600",
    "letter-spacing-body":"0em","letter-spacing-display":"0em",
    "space-1":"0.125rem","space-2":"0.25rem","space-3":"0.375rem","space-4":"0.5rem","space-5":"0.625rem","space-6":"0.75rem","space-8":"1rem","space-12":"1.5rem",
    "card-padding":"0.5rem","card-gap":"0.25rem","section-gap":"0.375rem",
    "radius-sm":"0","radius-md":"0","radius-lg":"0","radius-xl":"0","radius-pill":"0","radius-card":"0","radius-btn":"0",
    "elev-flat":"none","elev-raised":"none","elev-ring":"0 0 0 1px var(--border)","motion-base":"100ms","motion-fast":"50ms",
  },
  pill: {
    "font-body": '"Geist", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    "font-display": '"Geist", "Inter", -apple-system, sans-serif',
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "text-xs":"0.625rem","text-sm":"0.75rem","text-base":"0.875rem","text-lg":"1.125rem","text-xl":"1.25rem","text-2xl":"1.5rem","text-3xl":"1.875rem","text-4xl":"2.25rem",
    "leading-body":"1.6","leading-tight":"1.3","tracking-display":"-0.02em","meta":"0.625rem",
    "font-weight-normal":"400","font-weight-strong":"500","font-weight-display":"600",
    "letter-spacing-body":"-0.005em","letter-spacing-display":"-0.02em",
    "space-1":"0.25rem","space-2":"0.5rem","space-3":"0.75rem","space-4":"1rem","space-5":"1.5rem","space-6":"2rem","space-8":"2.5rem","space-12":"4rem",
    "card-padding":"1.25rem","card-gap":"1rem","section-gap":"1.5rem",
    "radius-sm":"0.5rem","radius-md":"0.75rem","radius-lg":"1rem","radius-xl":"1.25rem","radius-pill":"9999px","radius-card":"0.75rem","radius-btn":"9999px",
    "elev-flat":"none","elev-raised":"0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)","elev-ring":"0 0 0 1px rgba(0,0,0,0.05)","motion-base":"200ms","motion-fast":"100ms",
  },
  mono: {
    "font-body": "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', 'Fira Code', Consolas, monospace",
    "font-display": "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', monospace",
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "text-xs":"0.625rem","text-sm":"0.6875rem","text-base":"0.75rem","text-lg":"0.8125rem","text-xl":"0.875rem","text-2xl":"1rem","text-3xl":"1.125rem","text-4xl":"1.25rem",
    "leading-body":"1.4","leading-tight":"1.2","tracking-display":"0em","meta":"0.5625rem",
    "font-weight-normal":"400","font-weight-strong":"600","font-weight-display":"700",
    "letter-spacing-body":"0em","letter-spacing-display":"0em",
    "space-1":"0.125rem","space-2":"0.25rem","space-3":"0.375rem","space-4":"0.5rem","space-5":"0.625rem","space-6":"0.75rem","space-8":"1rem","space-12":"1.5rem",
    "card-padding":"0.5rem","card-gap":"0.25rem","section-gap":"0.375rem",
    "radius-sm":"0","radius-md":"0","radius-lg":"0","radius-xl":"0","radius-pill":"0","radius-card":"0","radius-btn":"0",
    "elev-flat":"none","elev-raised":"none","elev-ring":"0 0 0 1px var(--border)","motion-base":"50ms","motion-fast":"25ms",
  },
  news: {
    "font-body": '"Charter", "Georgia", "Times", "Palatino Linotype", serif',
    "font-display": '"Charter", "Georgia", "Times New Roman", serif',
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "text-xs":"0.75rem","text-sm":"0.8125rem","text-base":"1rem","text-lg":"1.25rem","text-xl":"1.5rem","text-2xl":"1.75rem","text-3xl":"2.25rem","text-4xl":"3rem",
    "leading-body":"1.7","leading-tight":"1.2","tracking-display":"-0.01em","meta":"0.6875rem",
    "font-weight-normal":"400","font-weight-strong":"700","font-weight-display":"800",
    "letter-spacing-body":"0.005em","letter-spacing-display":"-0.01em",
    "space-1":"0.25rem","space-2":"0.5rem","space-3":"0.75rem","space-4":"1rem","space-5":"1.5rem","space-6":"2rem","space-8":"2.5rem","space-12":"4rem",
    "card-padding":"1rem","card-gap":"0.75rem","section-gap":"1.25rem",
    "radius-sm":"0","radius-md":"0.125rem","radius-lg":"0.125rem","radius-xl":"0","radius-pill":"0","radius-card":"0","radius-btn":"0",
    "elev-flat":"none","elev-raised":"none","elev-ring":"0 0 0 1px var(--border)","motion-base":"120ms","motion-fast":"80ms",
  },
  retro: {
    "font-body": '"Press Start 2P", "Courier New", monospace',
    "font-display": '"Press Start 2P", "Courier New", monospace',
    "font-mono": '"Press Start 2P", "Courier New", monospace',
    "text-xs":"0.5rem","text-sm":"0.5625rem","text-base":"0.625rem","text-lg":"0.6875rem","text-xl":"0.75rem","text-2xl":"0.875rem","text-3xl":"1rem","text-4xl":"1.25rem",
    "leading-body":"1.5","leading-tight":"1.2","tracking-display":"0.02em","meta":"0.5rem",
    "font-weight-normal":"400","font-weight-strong":"400","font-weight-display":"400",
    "letter-spacing-body":"0.02em","letter-spacing-display":"0.02em",
    "space-1":"0.25rem","space-2":"0.375rem","space-3":"0.5rem","space-4":"0.75rem","space-5":"1rem","space-6":"1.25rem","space-8":"1.5rem","space-12":"2rem",
    "card-padding":"0.75rem","card-gap":"0.5rem","section-gap":"0.75rem",
    "radius-sm":"0","radius-md":"0","radius-lg":"0","radius-xl":"0","radius-pill":"0","radius-card":"0","radius-btn":"0",
    "elev-flat":"none","elev-raised":"4px 4px 0 0 var(--border)","elev-ring":"0 0 0 2px var(--fg)","motion-base":"60ms","motion-fast":"30ms",
  },
  synthwave: {
    "font-body": '"Orbitron", "Rajdhani", -apple-system, sans-serif',
    "font-display": '"Orbitron", "Rajdhani", sans-serif',
    "font-mono": '"Fira Code", "JetBrains Mono", ui-monospace, monospace',
    "text-xs":"0.625rem","text-sm":"0.6875rem","text-base":"0.75rem","text-lg":"0.875rem","text-xl":"1rem","text-2xl":"1.25rem","text-3xl":"1.5rem","text-4xl":"2rem",
    "leading-body":"1.4","leading-tight":"1.15","tracking-display":"0.06em","meta":"0.5625rem",
    "font-weight-normal":"400","font-weight-strong":"600","font-weight-display":"700",
    "letter-spacing-body":"0.03em","letter-spacing-display":"0.06em",
    "space-1":"0.25rem","space-2":"0.375rem","space-3":"0.5rem","space-4":"0.75rem","space-5":"1rem","space-6":"1.25rem","space-8":"1.5rem","space-12":"2rem",
    "card-padding":"0.75rem","card-gap":"0.5rem","section-gap":"0.75rem",
    "radius-sm":"0","radius-md":"0","radius-lg":"0","radius-xl":"0","radius-pill":"0","radius-card":"0","radius-btn":"0",
    "elev-flat":"none","elev-raised":"0 0 15px rgba(var(--accent), 0.3)","elev-ring":"0 0 0 1px var(--accent)","motion-base":"100ms","motion-fast":"60ms",
  },
  doom: {
    "font-body": '"Courier New", "Lucida Console", monospace',
    "font-display": '"Impact", "Arial Black", sans-serif',
    "font-mono": '"Courier New", monospace',
    "text-xs":"0.625rem","text-sm":"0.6875rem","text-base":"0.75rem","text-lg":"0.8125rem","text-xl":"0.9375rem","text-2xl":"1.125rem","text-3xl":"1.375rem","text-4xl":"1.75rem",
    "leading-body":"1.3","leading-tight":"1.1","tracking-display":"0.02em","meta":"0.5625rem",
    "font-weight-normal":"400","font-weight-strong":"700","font-weight-display":"700",
    "letter-spacing-body":"0.01em","letter-spacing-display":"0.02em",
    "space-1":"0.25rem","space-2":"0.375rem","space-3":"0.5rem","space-4":"0.75rem","space-5":"1rem","space-6":"1.25rem","space-8":"1.5rem","space-12":"2rem",
    "card-padding":"0.625rem","card-gap":"0.375rem","section-gap":"0.5rem",
    "radius-sm":"0","radius-md":"0","radius-lg":"0","radius-xl":"0","radius-pill":"0","radius-card":"0","radius-btn":"0",
    "elev-flat":"none","elev-raised":"2px 2px 0 0 var(--fg)","elev-ring":"0 0 0 2px var(--border)","motion-base":"80ms","motion-fast":"40ms",
  },
  brassy: {
    "font-body": '"Lora", "Charter", Georgia, serif',
    "font-display": '"Playfair Display", "Lora", Georgia, serif',
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "text-xs":"0.6875rem","text-sm":"0.8125rem","text-base":"0.9375rem","text-lg":"1.125rem","text-xl":"1.375rem","text-2xl":"1.75rem","text-3xl":"2.125rem","text-4xl":"2.75rem",
    "leading-body":"1.7","leading-tight":"1.3","tracking-display":"-0.005em","meta":"0.625rem",
    "font-weight-normal":"400","font-weight-strong":"600","font-weight-display":"700",
    "letter-spacing-body":"0.003em","letter-spacing-display":"-0.005em",
    "space-1":"0.25rem","space-2":"0.5rem","space-3":"0.75rem","space-4":"1rem","space-5":"1.5rem","space-6":"2rem","space-8":"2.5rem","space-12":"4rem",
    "card-padding":"1.125rem","card-gap":"0.875rem","section-gap":"1.5rem",
    "radius-sm":"0.1875rem","radius-md":"0.25rem","radius-lg":"0.375rem","radius-xl":"0.5rem","radius-pill":"9999px","radius-card":"0.25rem","radius-btn":"0.1875rem",
    "elev-flat":"none","elev-raised":"0 2px 8px rgba(0,0,0,0.08)","elev-ring":"0 0 0 1px var(--border)","motion-base":"180ms","motion-fast":"110ms",
  },
};

// Helper: spread style + apply palette
const t = (style, palette) => ({ ...structuredClone(style), ...palette });

const NEW_THEMES = {
  catppuccin: { name:"Catppuccin",emoji:"🐱",description:"warm pastel, rounded, cozy (tweakcn)",darkAlways:true,
    light: t(S.pill,{bg:"#1e1e2e",surface:"#1e1e2e",elevated:"#313244",fg:"#cdd6f4","fg-2":"#bac2de",muted:"#6c7086",disabled:"#45475a",border:"#45475a","border-soft":"#313244",accent:"#cba6f7","accent-hover":"#b4befe","accent-on":"#1e1e2e","tab-active-bg":"#cba6f7","tab-active-fg":"#1e1e2e",danger:"#f38ba8",success:"#a6e3a1",warn:"#f9e2af","elev-raised":"0 2px 12px rgba(203,166,247,0.1)"}) },
  cyberpunk: { name:"Cyberpunk",emoji:"⚡",description:"neon yellow, sharp, electric (tweakcn)",darkAlways:true,
    light: t(S.synthwave,{bg:"#0a0a0a",surface:"#0a0a0a",elevated:"#141414",fg:"#f5f5dc","fg-2":"#d4d4a0",muted:"#888844",disabled:"#444422",border:"#333300","border-soft":"#222200",accent:"#ffff00","accent-hover":"#ffff44","accent-on":"#0a0a0a","tab-active-bg":"#ffff00","tab-active-fg":"#0a0a0a",danger:"#ff3333",success:"#00ff66",warn:"#ffaa00","elev-raised":"0 0 20px rgba(255,255,0,0.15)"}) },
  "neo-brutalism": { name:"Neo Brutalism",emoji:"⚫",description:"high contrast, square, thick border (tweakcn)",
    light: t(S.tight,{bg:"#fffbeb",surface:"#fffbeb",elevated:"#fef3c7",fg:"#000000","fg-2":"#1a1a1a",muted:"#666666",disabled:"#aaaaaa",border:"#000000","border-soft":"#cccccc",accent:"#ff0044","accent-hover":"#cc0036","accent-on":"#ffffff","tab-active-bg":"#000000","tab-active-fg":"#fffbeb",danger:"#ff0000",success:"#00cc00",warn:"#ff8800","font-weight-normal":"600","font-weight-strong":"700","font-weight-display":"800","elev-raised":"4px 4px 0 0 #000000"}),
    dark: t(S.tight,{bg:"#000000",surface:"#000000",elevated:"#111111",fg:"#ffffff","fg-2":"#e0e0e0",muted:"#888888",disabled:"#555555",border:"#ffffff","border-soft":"#333333",accent:"#ff3366","accent-hover":"#ff6688","accent-on":"#000000","tab-active-bg":"#ffffff","tab-active-fg":"#000000","elev-raised":"4px 4px 0 0 #ffffff"}) },
  "vintage-paper": { name:"Vintage Paper",emoji:"📜",description:"sepia, serif, soft journal (tweakcn)",
    light: t(S.news,{bg:"#f5f0e8",surface:"#f5f0e8",elevated:"#ede4d4",fg:"#3d2b1a","fg-2":"#5c4028",muted:"#a08860",disabled:"#d0c0a8",border:"#d8c8a8","border-soft":"#e8dcc0",accent:"#8b5e3c","accent-hover":"#6d4a30","accent-on":"#ffffff","tab-active-bg":"#3d2b1a","tab-active-fg":"#ede4d4",danger:"#c04545",success:"#5a8a4a",warn:"#c49040"}),
    dark: t(S.news,{bg:"#1a1410",surface:"#1a1410",elevated:"#241e18",fg:"#e0ccb0","fg-2":"#c8b898",muted:"#8c7058",disabled:"#5c4830",border:"#3d2b1a","border-soft":"#2e2010",accent:"#c09060","accent-hover":"#d4a878","accent-on":"#1a1410","tab-active-bg":"#e0ccb0","tab-active-fg":"#1a1410"}) },
  "modern-minimal": { name:"Modern Minimal",emoji:"◼️",description:"clean monochrome, tight, refined (tweakcn)",
    light: t(S.comfortable,{bg:"#ffffff",surface:"#ffffff",elevated:"#f8f8f8",fg:"#0a0a0a","fg-2":"#1a1a1a",muted:"#737373",disabled:"#a3a3a3",border:"#e5e5e5","border-soft":"#f5f5f5",accent:"#0a0a0a","accent-hover":"#262626","accent-on":"#ffffff","tab-active-bg":"#0a0a0a","tab-active-fg":"#ffffff",danger:"#dc2626",success:"#16a34a",warn:"#d97706","radius-sm":"0.125rem","radius-md":"0.1875rem","radius-lg":"0.25rem","radius-card":"0.25rem","radius-btn":"0.1875rem"}),
    dark: t(S.comfortable,{bg:"#0a0a0a",surface:"#0a0a0a",elevated:"#171717",fg:"#fafafa","fg-2":"#e5e5e5",muted:"#737373",disabled:"#525252",border:"#262626","border-soft":"#1a1a1a",accent:"#fafafa","accent-hover":"#e5e5e5","accent-on":"#0a0a0a","tab-active-bg":"#fafafa","tab-active-fg":"#0a0a0a"}) },
  "amethyst-haze": { name:"Amethyst Haze",emoji:"💜",description:"purple gradient, soft, dreamy (tweakcn)",
    light: t(S.pill,{bg:"#faf5ff",surface:"#faf5ff",elevated:"#f3e8ff",fg:"#3b0764","fg-2":"#581c87",muted:"#9333ea",disabled:"#c084fc",border:"#e9d5ff","border-soft":"#f3e8ff",accent:"#7c3aed","accent-hover":"#6d28d9","accent-on":"#ffffff","tab-active-bg":"#3b0764","tab-active-fg":"#f3e8ff",danger:"#dc2626",success:"#059669",warn:"#d97706","elev-raised":"0 2px 16px rgba(124,58,237,0.1)"}),
    dark: t(S.pill,{bg:"#0d0221",surface:"#0d0221",elevated:"#160438",fg:"#e9d5ff","fg-2":"#d8b4fe",muted:"#a855f7",disabled:"#7c3aed",border:"#4c1d95","border-soft":"#3b0764",accent:"#a855f7","accent-hover":"#c084fc","accent-on":"#0d0221","tab-active-bg":"#e9d5ff","tab-active-fg":"#0d0221","elev-raised":"0 2px 16px rgba(168,85,247,0.15)"}) },
  "midnight-bloom": { name:"Midnight Bloom",emoji:"🌸",description:"dark indigo, elegant, bloom accent (tweakcn)",darkAlways:true,
    light: t(S.comfortable,{bg:"#0f0b1a",surface:"#0f0b1a",elevated:"#1a1430",fg:"#e8dff4","fg-2":"#d0c4e8",muted:"#7c6ea0",disabled:"#4a3d68",border:"#2d2348","border-soft":"#1f1838",accent:"#f472b6","accent-hover":"#f9a8d4","accent-on":"#0f0b1a","tab-active-bg":"#f472b6","tab-active-fg":"#0f0b1a",danger:"#fb7185",success:"#34d399",warn:"#fbbf24","elev-raised":"0 2px 16px rgba(244,114,182,0.08)"}) },
  "kodama-grove": { name:"Kodama Grove",emoji:"🌳",description:"forest green, natural, organic (tweakcn)",
    light: t(S.comfortable,{bg:"#f5faf0",surface:"#f5faf0",elevated:"#e8f5d4",fg:"#1a2a0a","fg-2":"#2a3a18",muted:"#5c7a3a",disabled:"#a0c080",border:"#c8e0a8","border-soft":"#ddf0c0",accent:"#4a7c2e","accent-hover":"#3a6822","accent-on":"#ffffff","tab-active-bg":"#1a2a0a","tab-active-fg":"#e8f5d4",danger:"#d94444",success:"#4a8a3a",warn:"#d9a030","radius-md":"0.5rem","radius-lg":"0.75rem","radius-card":"0.625rem","font-body":'"Figtree", "Inter", -apple-system, sans-serif'}),
    dark: t(S.comfortable,{bg:"#0a1a08",surface:"#0a1a08",elevated:"#102410",fg:"#d4e8c0","fg-2":"#b8d8a0",muted:"#5a7a3a",disabled:"#3a5028",border:"#1a3a18","border-soft":"#153010",accent:"#68a848","accent-hover":"#80c060","accent-on":"#0a1a08","tab-active-bg":"#d4e8c0","tab-active-fg":"#0a1a08"}) },
  tangerine: { name:"Tangerine",emoji:"🍊",description:"orange, energetic, warm (tweakcn)",
    light: t(S.pill,{bg:"#fffaf5",surface:"#fffaf5",elevated:"#fef0e0",fg:"#3d1808","fg-2":"#5c2810",muted:"#d07030",disabled:"#e8a870",border:"#f0c8a0","border-soft":"#f8e0c8",accent:"#f97316","accent-hover":"#ea580c","accent-on":"#ffffff","tab-active-bg":"#3d1808","tab-active-fg":"#fef0e0",danger:"#dc2626",success:"#16a34a",warn:"#eab308","elev-raised":"0 2px 12px rgba(249,115,22,0.08)"}),
    dark: t(S.pill,{bg:"#1a0c04",surface:"#1a0c04",elevated:"#241408",fg:"#f8d8b0","fg-2":"#f0c898",muted:"#c06830",disabled:"#784020",border:"#3d1808","border-soft":"#2e1004",accent:"#fb923c","accent-hover":"#fdba74","accent-on":"#1a0c04","tab-active-bg":"#f8d8b0","tab-active-fg":"#1a0c04"}) },
  caffeine: { name:"Caffeine",emoji:"☕",description:"coffee brown, cozy, serif (tweakcn)",
    light: t(S.brassy,{bg:"#fdfaf6",surface:"#fdfaf6",elevated:"#f8f0e4",fg:"#2c1810","fg-2":"#3d2418",muted:"#8c6c50",disabled:"#c0a080",border:"#e0ccb0","border-soft":"#f0e0d0",accent:"#7c4a30","accent-hover":"#633a24","accent-on":"#ffffff","tab-active-bg":"#2c1810","tab-active-fg":"#f8f0e4",danger:"#c05050",success:"#5a8a4a",warn:"#c49040"}),
    dark: t(S.brassy,{bg:"#140c08",surface:"#140c08",elevated:"#1e1410",fg:"#e0ccb0","fg-2":"#d0b898",muted:"#8c6c50",disabled:"#5c4030",border:"#3d2418","border-soft":"#2e1810",accent:"#b07850","accent-hover":"#c89068","accent-on":"#140c08","tab-active-bg":"#e0ccb0","tab-active-fg":"#140c08"}) },
  "retro-arcade": { name:"Retro Arcade",emoji:"🕹️",description:"pixel, arcade, bold neon (tweakcn)",darkAlways:true,
    light: t(S.retro,{bg:"#1a1a2e",surface:"#1a1a2e",elevated:"#16213e",fg:"#00ff88","fg-2":"#00cc66",muted:"#338855",disabled:"#225533",border:"#0f3460","border-soft":"#16213e",accent:"#e94560","accent-hover":"#ff6b81","accent-on":"#1a1a2e","tab-active-bg":"#00ff88","tab-active-fg":"#1a1a2e",danger:"#ff3366",success:"#00ff88",warn:"#ffcc00","elev-raised":"3px 3px 0 0 #0f3460"}) },
  "doom-64": { name:"Doom 64",emoji:"💀",description:"dark red, grungy, heavy (tweakcn)",darkAlways:true,
    light: t(S.doom,{bg:"#1a0a0a",surface:"#1a0a0a",elevated:"#241010",fg:"#ffccaa","fg-2":"#e8b898",muted:"#a05840",disabled:"#683828",border:"#3d1818","border-soft":"#2e1010",accent:"#ff4422","accent-hover":"#ff6644","accent-on":"#1a0a0a","tab-active-bg":"#ff4422","tab-active-fg":"#1a0a0a",danger:"#ff2222",success:"#44aa44",warn:"#ffaa22"}) },
  claymorphism: { name:"Claymorphism",emoji:"🧱",description:"chunky, soft pastels, 3D feel (tweakcn)",
    light: t({...S.pill,"space-1":"0.375rem","space-2":"0.625rem","space-3":"0.875rem","space-4":"1.25rem","space-5":"1.75rem","space-6":"2.25rem","space-8":"3rem","space-12":"4.5rem","card-padding":"1.5rem","card-gap":"1.25rem","section-gap":"2rem","radius-sm":"0.75rem","radius-md":"1rem","radius-lg":"1.5rem","radius-xl":"2rem","radius-card":"1.25rem","radius-btn":"9999px","elev-raised":"0 8px 24px rgba(224,144,96,0.12), inset 0 1px 0 rgba(255,255,255,0.7)","motion-base":"250ms","motion-fast":"150ms","font-body":'"Nunito", "SF Pro Rounded", -apple-system, sans-serif',"font-display":'"Nunito", "SF Pro Rounded", -apple-system, sans-serif'},
      {bg:"#fdf6f0",surface:"#fdf6f0",elevated:"#faeed8",fg:"#5c4030","fg-2":"#6d5040",muted:"#c09070",disabled:"#d8b898",border:"#e8ccb0","border-soft":"#f0ddd0",accent:"#e09060","accent-hover":"#c87848","accent-on":"#ffffff","tab-active-bg":"#5c4030","tab-active-fg":"#faeed8",danger:"#e06060",success:"#70a860",warn:"#e0a040"}),
    dark: t({...S.pill,"space-1":"0.375rem","space-2":"0.625rem","space-3":"0.875rem","space-4":"1.25rem","space-5":"1.75rem","space-6":"2.25rem","space-8":"3rem","space-12":"4.5rem","card-padding":"1.5rem","card-gap":"1.25rem","section-gap":"2rem","radius-sm":"0.75rem","radius-md":"1rem","radius-lg":"1.5rem","radius-xl":"2rem","radius-card":"1.25rem","radius-btn":"9999px","elev-raised":"0 8px 24px rgba(212,160,128,0.1), inset 0 1px 0 rgba(255,255,255,0.05)","motion-base":"250ms","motion-fast":"150ms"},
      {bg:"#1c1410",surface:"#1c1410",elevated:"#281c14",fg:"#e8ccb0","fg-2":"#d4b898",muted:"#a07050",disabled:"#684030",border:"#3d2818","border-soft":"#2e1c10",accent:"#d4a080","accent-hover":"#e0b898","accent-on":"#1c1410","tab-active-bg":"#e8ccb0","tab-active-fg":"#1c1410"}) },
  darkmatter: { name:"Darkmatter",emoji:"🌑",description:"near-black, subtle accent, sleek (tweakcn)",darkAlways:true,
    light: t(S.tight,{bg:"#080808",surface:"#080808",elevated:"#111111",fg:"#d4d4d4","fg-2":"#b8b8b8",muted:"#606060",disabled:"#383838",border:"#262626","border-soft":"#1a1a1a",accent:"#505050","accent-hover":"#686868","accent-on":"#e0e0e0","tab-active-bg":"#d4d4d4","tab-active-fg":"#080808",danger:"#603030",success:"#306030",warn:"#606030","elev-raised":"0 1px 4px rgba(0,0,0,0.5)","radius-sm":"0.125rem","radius-md":"0.1875rem","radius-lg":"0.25rem","radius-card":"0.25rem","radius-btn":"0.125rem"}) },
  "soft-pop": { name:"Soft Pop",emoji:"🎈",description:"playful, colorful, soft gradients (tweakcn)",
    light: t({...S.pill,"radius-sm":"0.625rem","radius-md":"0.875rem","radius-lg":"1.125rem","radius-card":"1rem","font-body":'"Quicksand", "Nunito", -apple-system, sans-serif',"font-display":'"Quicksand", "Nunito", -apple-system, sans-serif'},
      {bg:"#ffffff",surface:"#ffffff",elevated:"#f8f4ff",fg:"#2d1b4e","fg-2":"#3d2870",muted:"#9c6ade",disabled:"#c4a8f0",border:"#e4d4f8","border-soft":"#f0e8fc",accent:"#8b5cf6","accent-hover":"#7c3aed","accent-on":"#ffffff","tab-active-bg":"#2d1b4e","tab-active-fg":"#f8f4ff",danger:"#f87171",success:"#4ade80",warn:"#fbbf24","elev-raised":"0 4px 20px rgba(139,92,246,0.08)"}),
    dark: t({...S.pill,"radius-sm":"0.625rem","radius-md":"0.875rem","radius-lg":"1.125rem","radius-card":"1rem"},
      {bg:"#0f0820",surface:"#0f0820",elevated:"#1a1030",fg:"#e4d4fc","fg-2":"#d0bcf8",muted:"#9c6ade",disabled:"#5c3d98",border:"#2d1b4e","border-soft":"#1f1240",accent:"#a78bfa","accent-hover":"#c4b5fd","accent-on":"#0f0820","tab-active-bg":"#e4d4fc","tab-active-fg":"#0f0820","elev-raised":"0 4px 20px rgba(167,139,250,0.1)"}) },
};

// ── Merge ──
const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
let added = 0, updated = 0;
for (const [key, theme] of Object.entries(NEW_THEMES)) {
  if (tokens[key]) { tokens[key] = { ...tokens[key], ...theme }; updated++; }
  else { tokens[key] = theme; added++; }
}
writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + "\n");
console.log(`${added} added, ${updated} updated. Total: ${Object.keys(tokens).length}`);
