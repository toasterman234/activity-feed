"use client";

import { useEffect, useState, useCallback } from "react";
import {
  generateTheme,
  tokensToCssVars,
  NEUTRAL_NAMES,
  ACCENT_NAMES,
  STYLE_NAMES,
  type GeneratedTheme,
} from "./theme-generator";

// ── Sample components rendered under each theme ──────────────────────────────

function SampleCard({ label }: { label: string }) {
  return (
    <section
      className="rounded-[var(--radius-card)] border p-[var(--card-padding)]"
      style={{
        background: "var(--bg)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="font-semibold tracking-tight"
          style={{
            color: "var(--fg)",
            fontSize: "var(--text-lg)",
            fontFamily: "var(--font-display)",
            fontWeight: "var(--font-weight-display)",
          }}
        >
          {label}
        </h2>
        <span
          className="rounded-[var(--radius-pill)] border px-2 py-0.5"
          style={{
            borderColor: "var(--accent)",
            color: "var(--accent)",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-body)",
          }}
        >
          New
        </span>
      </div>
      <p
        style={{
          color: "var(--muted)",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          lineHeight: "var(--leading-body)",
        }}
      >
        This is a sample card showing how text and UI elements look under this
        design system. Chosen for readability contrast.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-[var(--radius-btn)] px-3 py-1.5 font-medium transition"
          style={{
            background: "var(--accent)",
            color: "var(--accent-on)",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
          }}
        >
          Primary
        </button>
        <button
          className="rounded-[var(--radius-btn)] border px-3 py-1.5 font-medium transition"
          style={{
            borderColor: "var(--border)",
            background: "var(--elevated)",
            color: "var(--fg)",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
          }}
        >
          Secondary
        </button>
      </div>
    </section>
  );
}

function SampleStatusChip() {
  const statuses = [
    { label: "Active", cls: "bg-emerald-500/15 text-emerald-600" },
    { label: "Warning", cls: "bg-amber-500/15 text-amber-600" },
    { label: "Error", cls: "bg-red-500/15 text-red-500" },
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {statuses.map((s) => (
        <span
          key={s.label}
          className="rounded-[var(--radius-sm)] border px-2 py-0.5"
          style={{
            borderColor: "var(--border)",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-body)",
            color: "var(--fg)",
          }}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function SampleTextScale() {
  return (
    <div className="space-y-1">
      {(["text-xs", "text-sm", "text-base", "text-lg", "text-xl"] as const).map(
        (size) => (
          <p
            key={size}
            style={{
              fontSize: `var(--${size})`,
              fontFamily: "var(--font-body)",
              color: "var(--fg-2)",
              lineHeight: "var(--leading-body)",
              letterSpacing: "var(--letter-spacing-body)",
            }}
          >
            {size.replace("text-", "").toUpperCase()} — The quick brown fox
          </p>
        )
      )}
    </div>
  );
}

function SampleListRow() {
  return (
    <div className="space-y-1">
      {["Research spike", "Write proposal", "Deploy fix"].map((item, i) => (
        <div
          key={item}
          className="rounded-[var(--radius-md)] border px-3 py-2 flex items-center gap-2"
          style={{
            borderColor: "var(--border)",
            background: i === 0 ? "var(--elevated)" : "transparent",
          }}
        >
          <span
            className="rounded-[var(--radius-pill)] w-2 h-2 shrink-0"
            style={{
              background:
                i === 0
                  ? "var(--accent)"
                  : i === 1
                    ? "var(--warn)"
                    : "var(--success)",
            }}
          />
          <span
            className="truncate font-medium"
            style={{
              color: "var(--fg)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-body)",
            }}
          >
            {item}
          </span>
          <span
            className="ml-auto shrink-0"
            style={{
              color: "var(--muted)",
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-body)",
            }}
          >
            {i === 0 ? "Today" : i === 1 ? "Yesterday" : "3d ago"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Theme preview card ───────────────────────────────────────────────────────

function ThemePreview({ theme }: { theme: GeneratedTheme; index: number }) {
  const cssVars = tokensToCssVars(theme.lightTokens);
  const darkVars = theme.darkTokens ? tokensToCssVars(theme.darkTokens) : null;

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg)",
      }}
    >
      {/* Light mode preview */}
      <div
        className="p-4 space-y-4 min-h-[380px]"
        style={{
          ...cssVars,
          fontFamily: cssVars["--font-body"],
          color: cssVars["--fg"],
          background: cssVars["--bg"],
        } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <div
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-base)",
              color: "var(--fg)",
            }}
          >
            {theme.name}
          </div>
          <span
            className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px]"
            style={{
              background: "var(--elevated)",
              color: "var(--muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            light
          </span>
        </div>
        <SampleCard label="Overview" />
        <SampleStatusChip />
        <SampleTextScale />
        <SampleListRow />
      </div>

      {/* Dark mode preview */}
      {darkVars && (
        <div
          className="p-4 space-y-4 min-h-[300px] border-t"
          style={{
            borderColor: "var(--border)",
            ...darkVars,
            fontFamily: darkVars["--font-body"],
            color: darkVars["--fg"],
            background: darkVars["--bg"],
          } as React.CSSProperties}
        >
          <span
            className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px]"
            style={{
              background: "var(--elevated)",
              color: "var(--muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            dark
          </span>
          <SampleCard label="Dark view" />
          <SampleListRow />
        </div>
      )}

      {/* Label */}
      <div
        className="px-4 py-2 border-t text-xs flex items-center justify-between"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--muted)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-xs)",
        }}
      >
        <span>{theme.description}</span>
        <div className="flex gap-2">
          <button
            className="hover:underline font-medium"
            onClick={(e) => {
              e.stopPropagation();
              const mode = "light";
              const cssVars = tokensToCssVars(theme.lightTokens);
              const root = document.documentElement;
              root.removeAttribute("data-theme");
              for (const [key, value] of Object.entries(cssVars)) {
                root.style.setProperty(key, value);
              }
              sessionStorage.setItem(
                "__proto_theme",
                JSON.stringify({ vars: cssVars, mode, name: theme.name })
              );
            }}
            style={{ color: "var(--accent)" }}
            title="Apply light theme to the real app"
          >
            Apply Light
          </button>
          {theme.darkTokens && (
            <button
              className="hover:underline font-medium"
              onClick={(e) => {
                e.stopPropagation();
                const cssVars = tokensToCssVars(theme.darkTokens);
                const root = document.documentElement;
                root.removeAttribute("data-theme");
                for (const [key, value] of Object.entries(cssVars)) {
                  root.style.setProperty(key, value);
                }
                sessionStorage.setItem(
                  "__proto_theme",
                  JSON.stringify({ vars: cssVars, mode: "dark", name: theme.name })
                );
              }}
              style={{ color: "var(--accent)" }}
              title="Apply dark theme to the real app"
            >
              Apply Dark
            </button>
          )}
          <button
            className="hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(JSON.stringify(theme, null, 2));
            }}
            style={{ color: "var(--accent)" }}
            title="Copy theme JSON"
          >
            Copy JSON
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ThemesPage() {
  const [neutral, setNeutral] = useState<string>("mauve");
  const [accent, setAccent] = useState<string>("violet");
  const [style, setStyle] = useState<string>("comfortable");
  const [darkOnly, setDarkOnly] = useState(false);
  const [themes, setThemes] = useState<GeneratedTheme[]>([]);

  const refresh = useCallback(() => {
    const baseTheme = generateTheme(neutral, accent, style, "base", darkOnly);
    setThemes([baseTheme]);
  }, [neutral, accent, style, darkOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const [liveTheme, setLiveTheme] = useState<string | null>(null);

  const applyLive = useCallback(() => {
    const t = themes[0];
    if (!t) return;
    const mode = darkOnly ? "dark" : "light";
    const vars = darkOnly && t.darkTokens ? t.darkTokens : t.lightTokens;
    const cssVars = tokensToCssVars(vars);

    // Apply to document
    const root = document.documentElement;
    root.removeAttribute("data-theme");
    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value);
    }

    // Persist for navigation
    sessionStorage.setItem(
      "__proto_theme",
      JSON.stringify({ vars: cssVars, mode, name: t.name })
    );
    setLiveTheme(t.name);
  }, [themes, darkOnly]);

  const clearLive = useCallback(() => {
    const root = document.documentElement;
    for (const key of Object.keys(tokensToCssVars(themes[0]?.lightTokens || {}))) {
      root.style.removeProperty(key);
    }
    root.setAttribute("data-theme", "default");
    sessionStorage.removeItem("__proto_theme");
    setLiveTheme(null);
  }, [themes]);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 pb-16">
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Theme Tester</h1>
            <p className="text-sm text-zinc-500">
              Dial in a design system and preview.{" "}
              <strong>Live Apply</strong> sets it on the real app.
            </p>
          </div>
          {liveTheme && (
            <button
              onClick={clearLive}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              ✕ Remove {liveTheme}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                Neutral palette
              </label>
              <select
                value={neutral}
                onChange={(e) => setNeutral(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-card px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {NEUTRAL_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                Accent palette
              </label>
              <select
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-card px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {ACCENT_NAMES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                Style preset
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-card px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {STYLE_NAMES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={darkOnly}
                  onChange={(e) => setDarkOnly(e.target.checked)}
                  className="rounded"
                />
                Always dark
              </label>
            </div>
          </div>
        </div>

        {/* Preview grid */}
        <div className="grid gap-4">
          {themes.map((t, i) => (
            <ThemePreview key={t.id} theme={t} index={i} />
          ))}
        </div>

        {themes.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-card p-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            Select palette and style options above to preview a theme.
          </div>
        )}
      </div>
    </div>
  );
}
