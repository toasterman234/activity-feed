/**
 * Theme token types.
 * Mirrors the structure in themes/tokens.json.
 */

/** Every CSS custom property value used by a theme variant (light or dark). */
export interface ThemeTokens {
  // palette
  bg: string;
  surface: string;
  elevated: string;
  fg: string;
  "fg-2": string;
  muted: string;
  disabled: string;
  border: string;
  "border-soft": string;
  accent: string;
  "accent-hover": string;
  "accent-on": string;
  "tab-active-bg": string;
  "tab-active-fg": string;
  danger: string;
  success: string;
  warn: string;
  // typography
  "font-body": string;
  "font-display": string;
  "font-mono": string;
  "text-xs": string;
  "text-sm": string;
  "text-base": string;
  "text-lg": string;
  "text-xl": string;
  "text-2xl": string;
  "text-3xl": string;
  "text-4xl": string;
  "leading-body": string;
  "leading-tight": string;
  "tracking-display": string;
  meta: string;
  "font-weight-normal": string;
  "font-weight-strong": string;
  "font-weight-display": string;
  "letter-spacing-body": string;
  "letter-spacing-display": string;
  // spacing
  "space-1": string;
  "space-2": string;
  "space-3": string;
  "space-4": string;
  "space-5": string;
  "space-6": string;
  "space-8": string;
  "space-12": string;
  "card-padding": string;
  "card-gap": string;
  "section-gap": string;
  // radius
  "radius-sm": string;
  "radius-md": string;
  "radius-lg": string;
  "radius-xl": string;
  "radius-pill": string;
  "radius-card": string;
  "radius-btn": string;
  // layout
  "container-max"?: string;
  "container-gutter-phone"?: string;
  "container-gutter-tablet"?: string;
  "container-gutter-desktop"?: string;
  "section-y-phone"?: string;
  "section-y-tablet"?: string;
  "section-y-desktop"?: string;
  "bottom-nav-height"?: string;
  // elevation & motion
  "elev-flat"?: string;
  "elev-raised"?: string;
  "elev-ring"?: string;
  "ease-standard"?: string;
  "motion-base"?: string;
  "motion-fast"?: string;
  "focus-ring"?: string;
  [key: string]: string | undefined;
}

/** A complete theme definition with light and dark variants. */
export interface ThemeDefinition {
  name: string;
  emoji?: string;
  description?: string;
  light: Partial<ThemeTokens>;
  dark?: Partial<ThemeTokens>;
  darkAlways?: boolean;
}

/** Top-level tokens.json structure. */
export type ThemeRegistry = Record<string, ThemeDefinition>;
