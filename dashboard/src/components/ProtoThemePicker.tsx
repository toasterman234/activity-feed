"use client";

import { useState, useCallback, useEffect } from "react";
import {
  generateTheme,
  tokensToCssVars,
  NEUTRAL_NAMES,
  ACCENT_NAMES,
  STYLE_NAMES,
  type GeneratedTheme,
} from "@/app/ops/themes/theme-generator";

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextIn<T extends readonly string[]>(list: T, current: string): string {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

function apply(theme: GeneratedTheme, mode: "light" | "dark") {
  const tokens = mode === "dark" && theme.darkTokens ? theme.darkTokens : theme.lightTokens;
  const vars = tokensToCssVars(tokens);
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  sessionStorage.setItem("__proto_theme", JSON.stringify({ vars, mode, name: theme.name }));
}

function clear() {
  sessionStorage.removeItem("__proto_theme");
  location.reload(); // go back to default theme
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProtoThemePicker() {
  const [neutral, setNeutral] = useState<string>("mauve");
  const [accent, setAccent] = useState<string>("violet");
  const [style, setStyle] = useState<string>("comfortable");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("__proto_theme");
      if (raw) {
        const data = JSON.parse(raw);
        setActive(data.name || "custom");
        // Don't re-apply — inline script in layout already did
      }
    } catch {}
  }, []);

  const theme = generateTheme(neutral, accent, style, `${neutral}-${accent}`, false);

  const handleApply = useCallback(() => {
    apply(theme, mode);
    setActive(theme.name);
  }, [theme, mode]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-20 right-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900/90 text-white shadow-lg backdrop-blur hover:bg-zinc-800"
        aria-label="Open theme picker"
      >
        🎨
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-[9999] w-64 select-none rounded-2xl border border-zinc-700 bg-zinc-900/95 p-4 text-sm text-zinc-200 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400">Theme Lab</span>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded-md p-0.5 text-zinc-500 hover:text-zinc-300"
          aria-label="Minimize"
        >
          −
        </button>
      </div>

      {/* Neutral — tap to cycle */}
      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
        Neutral
      </label>
      <div className="mb-2 flex gap-1">
        {NEUTRAL_NAMES.map((n) => (
          <button
            key={n}
            onClick={() => setNeutral(n)}
            className={`h-5 w-5 rounded-full border transition ${
              neutral === n ? "border-white scale-110" : "border-transparent"
            }`}
            style={{
              background: `var(--${n}-swatch, ${n === "gray" ? "#8d8d8d" : n === "mauve" ? "#8e8c99" : n === "slate" ? "#8b8d98" : n === "sage" ? "#868e8b" : n === "olive" ? "#898e87" : "#8d8d86"})`,
            }}
            title={n}
          />
        ))}
      </div>

      {/* Accent — tap to cycle */}
      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
        Accent
      </label>
      <div className="mb-2 flex gap-1 flex-wrap">
        {ACCENT_NAMES.map((a) => (
          <button
            key={a}
            onClick={() => setAccent(a)}
            className={`h-4 w-4 rounded-full border transition ${
              accent === a ? "border-white scale-110" : "border-transparent"
            }`}
            style={{
              background:
                a === "tomato" ? "#e54d2e" : a === "red" ? "#e5484d" : a === "ruby" ? "#e54666" :
                a === "crimson" ? "#e93d82" : a === "pink" ? "#d6409f" : a === "plum" ? "#ab4aba" :
                a === "purple" ? "#8e4ec6" : a === "violet" ? "#6e56cf" : a === "iris" ? "#5b5bd6" :
                a === "indigo" ? "#3e63dd" : a === "blue" ? "#0090ff" : a === "cyan" ? "#00a2c7" :
                a === "teal" ? "#12a594" : a === "jade" ? "#29a383" : a === "green" ? "#30a46c" :
                a === "grass" ? "#46a758" : a === "brown" ? "#ad7f58" : a === "bronze" ? "#a18072" :
                a === "gold" ? "#978365" : "#7ce2fe",
            }}
            title={a}
          />
        ))}
      </div>

      {/* Style & Mode row */}
      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
            Style
          </label>
          <button
            onClick={() => setStyle(nextIn(STYLE_NAMES as unknown as readonly string[], style))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-left text-xs text-zinc-300"
          >
            {style}
          </button>
        </div>
        <div className="flex-1">
          <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
            Mode
          </label>
          <button
            onClick={() => setMode(mode === "light" ? "dark" : "light")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-center text-xs text-zinc-300"
          >
            {mode === "light" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* Apply / Clear */}
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-500 transition"
        >
          Apply
        </button>
        {active && (
          <button
            onClick={clear}
            className="flex-1 rounded-lg border border-red-800 bg-red-900/40 py-2 text-xs text-red-300 hover:bg-red-900/60 transition"
          >
            Reset
          </button>
        )}
      </div>

      {active && (
        <div className="mt-2 text-center text-[10px] text-zinc-500">
          Active: {active}
        </div>
      )}
    </div>
  );
}
