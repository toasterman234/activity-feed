"use client";

import { useState, useEffect } from "react";

const themes = [
  { id: "default", label: "Default", emoji: "🔵" },
  { id: "editorial", label: "Editorial", emoji: "📖" },
  { id: "terminal", label: "Terminal", emoji: "💻" },
  { id: "modern", label: "Modern", emoji: "✨" },
  { id: "brutalist", label: "Brutalist", emoji: "⚡" },
  { id: "neon", label: "Neon", emoji: "💜" },
  { id: "paper", label: "Paper", emoji: "📜" },
  { id: "ocean", label: "Ocean", emoji: "🌊" },
  { id: "sunset", label: "Sunset", emoji: "🌅" },
  { id: "mint", label: "Mint", emoji: "🌿" },
  { id: "catppuccin", label: "Catppuccin", emoji: "🐱" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "⚡" },
  { id: "neo-brutalism", label: "Neo Brutalism", emoji: "⚫" },
  { id: "vintage-paper", label: "Vintage Paper", emoji: "📜" },
  { id: "modern-minimal", label: "Modern Minimal", emoji: "◼️" },
  { id: "amethyst-haze", label: "Amethyst Haze", emoji: "💜" },
  { id: "midnight-bloom", label: "Midnight Bloom", emoji: "🌸" },
  { id: "kodama-grove", label: "Kodama Grove", emoji: "🌳" },
  { id: "tangerine", label: "Tangerine", emoji: "🍊" },
  { id: "caffeine", label: "Caffeine", emoji: "☕" },
  { id: "retro-arcade", label: "Retro Arcade", emoji: "🕹️" },
  { id: "doom-64", label: "Doom 64", emoji: "💀" },
  { id: "claymorphism", label: "Claymorphism", emoji: "🧱" },
  { id: "darkmatter", label: "Darkmatter", emoji: "🌑" },
  { id: "soft-pop", label: "Soft Pop", emoji: "🎈" },
] as const;

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState("default");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("data-theme") || "default";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const switchTheme = (id: string) => {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem("data-theme", id);
    setOpen(false);
  };

  const current = themes.find((t) => t.id === theme) || themes[0];

  return (
    <div
      data-theme-switcher
      style={{
        position: "fixed",
        bottom: "calc(var(--bottom-nav-height) + 1rem + env(safe-area-inset-bottom) + 0.5rem)",
        right: "1rem",
        zIndex: 50,
      }}
    >
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            marginBottom: "0.5rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "0.375rem",
            boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            minWidth: "148px",
          }}
        >
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTheme(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: t.id === theme ? "var(--elevated)" : "transparent",
                color: "var(--fg)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-sm)",
                fontWeight: t.id === theme ? "var(--font-weight-strong)" : "var(--font-weight-normal)",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              {t.id === theme && (
                <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.75rem",
          height: "2.75rem",
          border: "1px solid var(--border)",
          borderRadius: "50%",
          background: "var(--surface)",
          color: "var(--fg)",
          cursor: "pointer",
          fontSize: "1.25rem",
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          marginLeft: "auto",
        }}
        aria-label="Switch theme"
      >
        {current.emoji}
      </button>
    </div>
  );
}
