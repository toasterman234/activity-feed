"use client";

import type { ReactNode } from "react";

/**
 * Forces light-mode (white bg, dark text) tokens everywhere inside the desktop layout.
 * Content components use Tailwind's `dark:` variants which only activate with the `dark`
 * class — by NOT adding it, they render their light defaults, which is what we want.
 */
export default function LightWrapper({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        "--bg": "#ffffff",
        "--surface": "#ffffff",
        "--elevated": "#fafafa",
        "--fg": "#18181b",
        "--fg-2": "#27272a",
        "--muted": "#71717a",
        "--disabled": "#a1a1aa",
        "--border": "#e4e4e7",
        "--border-soft": "#f4f4f5",
        "--accent": "#2563eb",
        "--accent-hover": "#1d4ed8",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
