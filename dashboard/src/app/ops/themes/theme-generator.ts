"use client";

/**
 * Client-side palette data and theme generation.
 * Mirrors themes/generate-from-palette.ts logic but runs in the browser.
 */

export type RadixScale = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

export interface ThemeTokens {
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
  "tracking-display"?: string;
  meta: string;
  "font-weight-normal": string;
  "font-weight-strong": string;
  "font-weight-display": string;
  "letter-spacing-body": string;
  "letter-spacing-display": string;
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
  "radius-sm": string;
  "radius-md": string;
  "radius-lg": string;
  "radius-xl": string;
  "radius-pill": string;
  "radius-card": string;
  "radius-btn": string;
  "elev-flat"?: string;
  "elev-raised"?: string;
  "elev-ring"?: string;
  "motion-base": string;
  "motion-fast": string;
  "focus-ring"?: string;
  [key: string]: string | undefined;
}

interface PalettePair {
  light: RadixScale;
  dark: RadixScale;
}

const PALETTES: Record<string, PalettePair> = {
  gray:   { light: ["#fcfcfc","#f9f9f9","#f0f0f0","#e8e8e8","#e0e0e0","#d9d9d9","#cecece","#bbbbbb","#8d8d8d","#838383","#646464","#202020"], dark: ["#111111","#191919","#222222","#2a2a2a","#313131","#3a3a3a","#484848","#606060","#6e6e6e","#7b7b7b","#b4b4b4","#eeeeee"] },
  mauve:  { light: ["#fdfcfd","#faf9fb","#f2eff3","#eae7ec","#e3dfe6","#dbd8e0","#d0cdd7","#bcbac7","#8e8c99","#84828e","#65636d","#211f26"], dark: ["#121113","#1a191b","#232225","#2b292d","#323035","#3c393f","#49474e","#625f69","#6f6d78","#7c7a85","#b5b2bc","#eeeeef"] },
  slate:  { light: ["#fcfcfd","#f9f9fb","#f0f0f3","#e8e8ec","#e0e1e6","#d9d9e0","#cdced6","#b9bbc6","#8b8d98","#80838d","#60646c","#1c2024"], dark: ["#111113","#18191b","#212225","#272a2d","#2e3135","#363a3f","#43484e","#5a6169","#696e77","#777b84","#b0b4ba","#edeef0"] },
  sage:   { light: ["#fbfdfc","#f7f9f8","#eef1f0","#e6e9e8","#dfe2e0","#d7dad9","#cbcfcd","#b8bcba","#868e8b","#7c8481","#5f6563","#1a211e"], dark: ["#101211","#171918","#202221","#272a29","#2e3130","#373b39","#444947","#5b625f","#63706b","#717d79","#adb5b1","#eceeed"] },
  olive:  { light: ["#fcfdfc","#f8faf8","#eff1ef","#e7e9e7","#dfe2df","#d7dad7","#cccfcc","#b9bcb8","#898e87","#7f847d","#60655f","#1d211c"], dark: ["#111210","#191a18","#212320","#282b28","#2f312e","#383b37","#454843","#5c615b","#667066","#757e74","#afb5ad","#eceeec"] },
  sand:   { light: ["#fdfdfc","#f9f9f8","#f1f0ef","#e9e8e6","#e2e1de","#dad9d6","#cfceca","#bcbbb5","#8d8d86","#82827c","#63635e","#21201c"], dark: ["#111110","#191918","#222220","#2a2a28","#31312e","#3b3a37","#494844","#62605b","#6f6d66","#7c7b74","#b5b3ad","#eeeeec"] },
  tomato: { light: ["#fffcfc","#fff8f7","#feebe7","#ffdcd3","#ffcdc2","#fdbdaf","#f5a898","#ec8e7b","#e54d2e","#dd4425","#d13415","#5c271f"], dark: ["#181111","#1f1513","#391714","#4e1511","#5e1c16","#6e2920","#853a2d","#ac4d39","#e54d2e","#ec6142","#f07a60","#fed5cc"] },
  red:    { light: ["#fffcfc","#fff7f7","#feebec","#ffdbdc","#ffcdce","#fdbdbe","#f4a9aa","#eb8e90","#e5484d","#dc3e42","#ce2c31","#641723"], dark: ["#191111","#201314","#3b1219","#500f1c","#611623","#72232d","#8c333a","#b54548","#e5484d","#ec5d5e","#f07173","#fdd3d4"] },
  ruby:   { light: ["#fffcfd","#fff7f8","#feeaed","#ffdce1","#ffced6","#f8bfc8","#efacb8","#e592a3","#e54666","#dc3b5d","#ca244d","#64172b"], dark: ["#191113","#1e1517","#3a1419","#4e111b","#611623","#71232b","#8c3440","#b74958","#e54666","#ec5d72","#f07384","#fdd2d8"] },
  crimson:{ light: ["#fffcfd","#fef7f9","#ffe9f0","#fedce7","#facedd","#f3bed1","#eaacc3","#e093b2","#e93d82","#df3478","#cb1d63","#621639"], dark: ["#191114","#201318","#381525","#4d122f","#5c1839","#6d2545","#873356","#b0436e","#e93d82","#ee518a","#f06897","#fed2e1"] },
  pink:   { light: ["#fffcfe","#fef7fb","#fee9f5","#fbdcef","#f6cee7","#efbfdd","#e7acd0","#dd93c2","#d6409f","#cf3897","#c2298a","#651249"], dark: ["#191117","#21121d","#37172f","#4b143d","#5c1c4a","#6d2859","#88366d","#b2478a","#d6409f","#e34ba5","#f060b3","#fed2e7"] },
  plum:   { light: ["#fefcff","#fdf7fd","#fbebfb","#f7def8","#f2d1f3","#e9c2ec","#deade3","#cf91d8","#ab4aba","#a144af","#953ea3","#53195d"], dark: ["#181118","#201320","#351a35","#451d47","#512454","#5e3061","#734079","#92549c","#ab4aba","#b658c4","#c56dd0","#f2d5f6"] },
  purple: { light: ["#fefcfe","#fbf7fe","#f7edfe","#f2e2fc","#ead5f9","#e0c4f4","#d1afec","#be93e4","#8e4ec6","#8347b9","#8145b5","#402060"], dark: ["#18111b","#1e1523","#301c3b","#3d224e","#48295c","#54346b","#664282","#8456aa","#8e4ec6","#9a5cd0","#af6ede","#ecd9fc"] },
  violet: { light: ["#fdfcfe","#faf8ff","#f4f0fe","#ebe4ff","#e1d9ff","#d4cafe","#c2b5f5","#aa99ec","#6e56cf","#654dc4","#6550b9","#2f265f"], dark: ["#14121f","#1b1725","#2d2546","#362a5b","#42336a","#503e7c","#5d4d91","#7965b7","#6e56cf","#7c66dc","#917dea","#e4defc"] },
  iris:   { light: ["#fdfdff","#f8f8ff","#f0f1fe","#e6e7ff","#dadcff","#cbcdff","#b8baf8","#9b9ef0","#5b5bd6","#5151cd","#5753c6","#272962"], dark: ["#13131e","#171625","#202248","#262a65","#303274","#3d3e85","#4a4a98","#5958b8","#5b5bd6","#6e6ade","#8481f0","#e0dffe"] },
  indigo: { light: ["#fdfdfe","#f7f9ff","#edf2fe","#e1e9ff","#d2deff","#c1d0ff","#abbdf9","#8da4ef","#3e63dd","#3358d4","#3a5bc7","#1f2d5c"], dark: ["#11131f","#141726","#182449","#1d2e62","#253974","#304384","#3a4f97","#435db1","#3e63dd","#5472e4","#6e89ed","#e0e4fd"] },
  blue:   { light: ["#fbfdff","#f4faff","#e6f4fe","#d5efff","#c2e5ff","#acd8fc","#8ec8f6","#5eb1ef","#0090ff","#0588f0","#0d74ce","#113264"], dark: ["#0d1520","#111927","#0d2847","#003362","#004074","#104d87","#205d9e","#2870bd","#0090ff","#3b9eff","#70b8ff","#c2e6ff"] },
  cyan:   { light: ["#fafdfe","#f2fafb","#def7f9","#caf1f6","#b5e9f0","#9ddde7","#7dcedc","#3db9cf","#00a2c7","#0797b9","#107d98","#0d3c48"], dark: ["#0b161a","#101b20","#082c36","#003848","#004558","#045468","#12677e","#11809c","#00a2c7","#23afd3","#4ccce6","#b6ecf7"] },
  teal:   { light: ["#fafefd","#f3fbf9","#e0f8f3","#ccf3ea","#b8eae0","#a1ded2","#83cdc1","#53b9ab","#12a594","#0d9b8a","#008573","#0d3d38"], dark: ["#0d1514","#111c1b","#0d2d2a","#023b37","#084843","#115550","#1d6961","#2a8076","#12a594","#35b1a3","#5acec1","#b7ece5"] },
  jade:   { light: ["#fbfefd","#f4fbf7","#e6f7ed","#d6f1e3","#c3e9d7","#acdec8","#8bceb6","#56ba9f","#29a383","#26997b","#208368","#1d3b31"], dark: ["#0d1512","#121c18","#0f2e22","#0b3b2c","#114837","#1b5745","#246854","#2e7f68","#29a383","#3bb395","#55ccad","#b7ece0"] },
  green:  { light: ["#fbfefc","#f4fbf6","#e6f6eb","#d6f1df","#c4e8d1","#adddc0","#8eceaa","#5bb98b","#30a46c","#2b9a66","#218358","#193b2d"], dark: ["#0e1512","#121b17","#132d21","#113b29","#174933","#20573d","#28684a","#2f7c57","#30a46c","#33b074","#45cc8a","#b9ecd0"] },
  grass:  { light: ["#fbfefb","#f5fbf5","#e9f6e9","#daf1db","#c9e8ca","#b2ddb5","#94ce9a","#65ba74","#46a758","#3e9b4f","#2a7e3b","#203c25"], dark: ["#0e1511","#141a15","#1b2a1e","#1d3a24","#25482d","#2d5736","#366740","#3e7b49","#46a758","#53b364","#6fcf7f","#bfedc7"] },
  brown:  { light: ["#fefdfc","#fcf9f6","#f6eee7","#f0e4d9","#ebdaca","#e4cdb7","#dcbc9f","#cea37e","#ad7f58","#a07553","#815e46","#3e332e"], dark: ["#12110f","#1c1816","#28211d","#322922","#3c3128","#483a2f","#574439","#6d5343","#ad7f58","#b58b67","#cba78b","#f2e1d4"] },
  bronze: { light: ["#fdfcfc","#fdf7f5","#f6edea","#efe4df","#e7d9d3","#dfcdc5","#d3bcb3","#c2a499","#a18072","#957468","#7d5e54","#43302b"], dark: ["#141110","#1c1917","#26211e","#2f2925","#38312c","#433b35","#514741","#655b53","#a18072","#ae8d7f","#caae9f","#f3e3db"] },
  gold:   { light: ["#fdfdfc","#faf9f2","#f2f0e7","#eae6db","#e1dccf","#d8d0bf","#cbc0aa","#b9a88d","#978365","#8c7a5e","#71624b","#3b352b"], dark: ["#121211","#1b1a17","#24231f","#2d2b26","#38352e","#444039","#544f46","#696254","#978365","#a59071","#bfac8d","#f2e8d5"] },
  sky:    { light: ["#f9feff","#f1fafd","#e1f6fd","#d1f0fa","#bee7f5","#a9daed","#8dcae3","#60b3d7","#7ce2fe","#74daf8","#00749e","#1d3e56"], dark: ["#0d141f","#111a27","#112840","#113555","#154467","#1b537b","#1f6692","#1e7cb5","#7ce2fe","#a8eeff","#75c7f0","#c2f3ff"] },
};

const STYLES: Record<string, { desc: string; tokens: Record<string, string> }> = {
  tight: {
    desc: "Tight, sharp, compact",
    tokens: {
      "font-body": '"Inter", -apple-system, sans-serif',
      "font-display": '"Inter", -apple-system, sans-serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.625rem", "text-sm": "0.6875rem", "text-base": "0.75rem",
      "text-lg": "0.8125rem", "text-xl": "0.875rem", "text-2xl": "0.9375rem",
      "text-3xl": "1rem", "text-4xl": "1.125rem",
      "leading-body": "1.35", "leading-tight": "1.15",
      meta: "0.5625rem",
      "font-weight-normal": "400", "font-weight-strong": "500", "font-weight-display": "600",
      "letter-spacing-body": "0em", "letter-spacing-display": "0em",
      "space-1": "0.125rem", "space-2": "0.25rem", "space-3": "0.375rem",
      "space-4": "0.5rem", "space-5": "0.625rem", "space-6": "0.75rem",
      "space-8": "1rem", "space-12": "1.5rem",
      "card-padding": "0.5rem", "card-gap": "0.25rem", "section-gap": "0.375rem",
      "radius-sm": "0", "radius-md": "0", "radius-lg": "0",
      "radius-xl": "0", "radius-pill": "0", "radius-card": "0", "radius-btn": "0",
      "elev-raised": "none", "motion-base": "100ms", "motion-fast": "50ms",
    },
  },
  comfortable: {
    desc: "Balanced, readable, default-like",
    tokens: {
      "font-body": '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      "font-display": '"Inter", -apple-system, sans-serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.688rem", "text-sm": "0.813rem", "text-base": "0.875rem",
      "text-lg": "1rem", "text-xl": "1.125rem", "text-2xl": "1.25rem",
      "text-3xl": "1.5rem", "text-4xl": "1.875rem",
      "leading-body": "1.5", "leading-tight": "1.25",
      "tracking-display": "-0.01em", meta: "0.625rem",
      "font-weight-normal": "400", "font-weight-strong": "600", "font-weight-display": "700",
      "letter-spacing-body": "normal", "letter-spacing-display": "-0.01em",
      "space-1": "0.25rem", "space-2": "0.5rem", "space-3": "0.75rem",
      "space-4": "1rem", "space-5": "1.25rem", "space-6": "1.5rem",
      "space-8": "2rem", "space-12": "3rem",
      "card-padding": "0.875rem", "card-gap": "0.625rem", "section-gap": "1rem",
      "radius-sm": "0.25rem", "radius-md": "0.375rem", "radius-lg": "0.5rem",
      "radius-xl": "0.75rem", "radius-pill": "9999px",
      "radius-card": "0.5rem", "radius-btn": "0.375rem",
      "elev-raised": "none", "motion-base": "150ms", "motion-fast": "100ms",
    },
  },
  airy: {
    desc: "Serif, airy, relaxed",
    tokens: {
      "font-body": 'Georgia, "Times New Roman", "Palatino Linotype", serif',
      "font-display": 'Georgia, "Times New Roman", serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.75rem", "text-sm": "0.875rem", "text-base": "1rem",
      "text-lg": "1.1875rem", "text-xl": "1.375rem", "text-2xl": "1.6875rem",
      "text-3xl": "2rem", "text-4xl": "2.5rem",
      "leading-body": "1.75", "leading-tight": "1.35",
      "tracking-display": "-0.005em", meta: "0.6875rem",
      "font-weight-normal": "400", "font-weight-strong": "600", "font-weight-display": "700",
      "letter-spacing-body": "0.003em", "letter-spacing-display": "-0.005em",
      "space-1": "0.3125rem", "space-2": "0.625rem", "space-3": "0.9375rem",
      "space-4": "1.25rem", "space-5": "1.5625rem", "space-6": "1.875rem",
      "space-8": "2.5rem", "space-12": "3.75rem",
      "card-padding": "1.125rem", "card-gap": "0.9375rem", "section-gap": "1.5rem",
      "radius-sm": "0.1875rem", "radius-md": "0.25rem", "radius-lg": "0.375rem",
      "radius-xl": "0.5rem", "radius-pill": "9999px",
      "radius-card": "0.25rem", "radius-btn": "0.1875rem",
      "elev-raised": "0 1px 3px rgba(0,0,0,0.06)", "motion-base": "200ms", "motion-fast": "120ms",
    },
  },
  pill: {
    desc: "Modern, pill buttons, generous",
    tokens: {
      "font-body": '"Geist", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      "font-display": '"Geist", "Inter", -apple-system, sans-serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.625rem", "text-sm": "0.75rem", "text-base": "0.875rem",
      "text-lg": "1.125rem", "text-xl": "1.25rem", "text-2xl": "1.5rem",
      "text-3xl": "1.875rem", "text-4xl": "2.25rem",
      "leading-body": "1.6", "leading-tight": "1.3",
      "tracking-display": "-0.02em", meta: "0.625rem",
      "font-weight-normal": "400", "font-weight-strong": "500", "font-weight-display": "600",
      "letter-spacing-body": "-0.005em", "letter-spacing-display": "-0.02em",
      "space-1": "0.25rem", "space-2": "0.5rem", "space-3": "0.75rem",
      "space-4": "1rem", "space-5": "1.5rem", "space-6": "2rem",
      "space-8": "2.5rem", "space-12": "4rem",
      "card-padding": "1.25rem", "card-gap": "1rem", "section-gap": "1.5rem",
      "radius-sm": "0.5rem", "radius-md": "0.75rem", "radius-lg": "1rem",
      "radius-xl": "1.25rem", "radius-pill": "9999px",
      "radius-card": "0.75rem", "radius-btn": "9999px",
      "elev-raised": "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
      "motion-base": "200ms", "motion-fast": "100ms",
    },
  },
  brutal: {
    desc: "Bold, square, high contrast",
    tokens: {
      "font-body": '"Arial Black", "Impact", "Franklin Gothic Heavy", -apple-system, sans-serif',
      "font-display": '"Arial Black", "Impact", "Franklin Gothic Heavy", sans-serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.625rem", "text-sm": "0.6875rem", "text-base": "0.75rem",
      "text-lg": "0.875rem", "text-xl": "1rem", "text-2xl": "1.25rem",
      "text-3xl": "1.5rem", "text-4xl": "2rem",
      "leading-body": "1.25", "leading-tight": "1",
      meta: "0.5625rem",
      "font-weight-normal": "700", "font-weight-strong": "800", "font-weight-display": "900",
      "letter-spacing-body": "-0.015em", "letter-spacing-display": "-0.02em",
      "space-1": "0.25rem", "space-2": "0.375rem", "space-3": "0.5rem",
      "space-4": "0.75rem", "space-5": "1rem", "space-6": "1.25rem",
      "space-8": "1.5rem", "space-12": "2rem",
      "card-padding": "0.75rem", "card-gap": "0.5rem", "section-gap": "0.75rem",
      "radius-sm": "0", "radius-md": "0", "radius-lg": "0",
      "radius-xl": "0", "radius-pill": "0", "radius-card": "0", "radius-btn": "0",
      "elev-raised": "3px 3px 0 0 var(--border)", "motion-base": "80ms", "motion-fast": "40ms",
    },
  },
  mono: {
    desc: "Terminal, code, hacker",
    tokens: {
      "font-body": "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', 'Fira Code', Consolas, monospace",
      "font-display": "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', monospace",
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.625rem", "text-sm": "0.6875rem", "text-base": "0.75rem",
      "text-lg": "0.8125rem", "text-xl": "0.875rem", "text-2xl": "1rem",
      "text-3xl": "1.125rem", "text-4xl": "1.25rem",
      "leading-body": "1.4", "leading-tight": "1.2",
      meta: "0.5625rem",
      "font-weight-normal": "400", "font-weight-strong": "600", "font-weight-display": "700",
      "letter-spacing-body": "0em", "letter-spacing-display": "0em",
      "space-1": "0.125rem", "space-2": "0.25rem", "space-3": "0.375rem",
      "space-4": "0.5rem", "space-5": "0.625rem", "space-6": "0.75rem",
      "space-8": "1rem", "space-12": "1.5rem",
      "card-padding": "0.5rem", "card-gap": "0.25rem", "section-gap": "0.375rem",
      "radius-sm": "0", "radius-md": "0", "radius-lg": "0",
      "radius-xl": "0", "radius-pill": "0", "radius-card": "0", "radius-btn": "0",
      "elev-raised": "none", "motion-base": "50ms", "motion-fast": "25ms",
    },
  },
  news: {
    desc: "Editorial, newspaper, authoritative",
    tokens: {
      "font-body": '"Charter", "Georgia", "Times", "Palatino Linotype", serif',
      "font-display": '"Charter", "Georgia", "Times New Roman", serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.75rem", "text-sm": "0.8125rem", "text-base": "1rem",
      "text-lg": "1.25rem", "text-xl": "1.5rem", "text-2xl": "1.75rem",
      "text-3xl": "2.25rem", "text-4xl": "3rem",
      "leading-body": "1.7", "leading-tight": "1.2",
      "tracking-display": "-0.01em", meta: "0.6875rem",
      "font-weight-normal": "400", "font-weight-strong": "700", "font-weight-display": "800",
      "letter-spacing-body": "0.005em", "letter-spacing-display": "-0.01em",
      "space-1": "0.25rem", "space-2": "0.5rem", "space-3": "0.75rem",
      "space-4": "1rem", "space-5": "1.5rem", "space-6": "2rem",
      "space-8": "2.5rem", "space-12": "4rem",
      "card-padding": "1rem", "card-gap": "0.75rem", "section-gap": "1.25rem",
      "radius-sm": "0", "radius-md": "0.125rem", "radius-lg": "0.125rem",
      "radius-xl": "0", "radius-pill": "0", "radius-card": "0", "radius-btn": "0",
      "elev-raised": "none", "motion-base": "120ms", "motion-fast": "80ms",
    },
  },
  elegant: {
    desc: "Thin, refined, high-end",
    tokens: {
      "font-body": '"Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      "font-display": '"Playfair Display", "Georgia", "Palatino Linotype", serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.625rem", "text-sm": "0.75rem", "text-base": "0.8125rem",
      "text-lg": "0.9375rem", "text-xl": "1.125rem", "text-2xl": "1.375rem",
      "text-3xl": "1.75rem", "text-4xl": "2.25rem",
      "leading-body": "1.75", "leading-tight": "1.3",
      "tracking-display": "0.02em", meta: "0.625rem",
      "font-weight-normal": "300", "font-weight-strong": "400", "font-weight-display": "400",
      "letter-spacing-body": "0.01em", "letter-spacing-display": "0.04em",
      "space-1": "0.5rem", "space-2": "0.75rem", "space-3": "1rem",
      "space-4": "1.5rem", "space-5": "2rem", "space-6": "2.5rem",
      "space-8": "3rem", "space-12": "5rem",
      "card-padding": "1.5rem", "card-gap": "1.25rem", "section-gap": "2rem",
      "radius-sm": "0", "radius-md": "0", "radius-lg": "0",
      "radius-xl": "0", "radius-pill": "0", "radius-card": "0", "radius-btn": "0",
      "elev-raised": "0 1px 3px rgba(0,0,0,0.04)", "motion-base": "300ms", "motion-fast": "150ms",
    },
  },
  playful: {
    desc: "Round, colorful, app-like",
    tokens: {
      "font-body": '"Nunito", "SF Pro Rounded", "Inter", -apple-system, sans-serif',
      "font-display": '"Nunito", "SF Pro Rounded", -apple-system, sans-serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.75rem", "text-sm": "0.875rem", "text-base": "1rem",
      "text-lg": "1.1875rem", "text-xl": "1.375rem", "text-2xl": "1.625rem",
      "text-3xl": "1.875rem", "text-4xl": "2.25rem",
      "leading-body": "1.6", "leading-tight": "1.25",
      "tracking-display": "-0.015em", meta: "0.6875rem",
      "font-weight-normal": "400", "font-weight-strong": "600", "font-weight-display": "700",
      "letter-spacing-body": "-0.01em", "letter-spacing-display": "-0.015em",
      "space-1": "0.375rem", "space-2": "0.625rem", "space-3": "0.875rem",
      "space-4": "1.125rem", "space-5": "1.5rem", "space-6": "1.75rem",
      "space-8": "2.25rem", "space-12": "3.5rem",
      "card-padding": "1rem", "card-gap": "0.75rem", "section-gap": "1.25rem",
      "radius-sm": "0.5rem", "radius-md": "0.75rem", "radius-lg": "1rem",
      "radius-xl": "1.25rem", "radius-pill": "9999px",
      "radius-card": "1rem", "radius-btn": "9999px",
      "elev-raised": "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)",
      "motion-base": "200ms", "motion-fast": "100ms",
    },
  },
  glass: {
    desc: "Frosted, translucent, layered",
    tokens: {
      "font-body": '"SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      "font-display": '"SF Pro Display", "Inter", -apple-system, sans-serif',
      "font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "text-xs": "0.6875rem", "text-sm": "0.8125rem", "text-base": "0.875rem",
      "text-lg": "1rem", "text-xl": "1.125rem", "text-2xl": "1.375rem",
      "text-3xl": "1.75rem", "text-4xl": "2.25rem",
      "leading-body": "1.6", "leading-tight": "1.25",
      "tracking-display": "-0.01em", meta: "0.625rem",
      "font-weight-normal": "400", "font-weight-strong": "500", "font-weight-display": "600",
      "letter-spacing-body": "-0.005em", "letter-spacing-display": "-0.01em",
      "space-1": "0.25rem", "space-2": "0.5rem", "space-3": "0.75rem",
      "space-4": "1rem", "space-5": "1.25rem", "space-6": "1.5rem",
      "space-8": "2rem", "space-12": "3rem",
      "card-padding": "1rem", "card-gap": "0.75rem", "section-gap": "1.25rem",
      "radius-sm": "0.375rem", "radius-md": "0.5rem", "radius-lg": "0.75rem",
      "radius-xl": "1rem", "radius-pill": "9999px",
      "radius-card": "0.75rem", "radius-btn": "0.5rem",
      "elev-raised": "0 4px 24px rgba(0,0,0,0.06)",
      "motion-base": "250ms", "motion-fast": "120ms",
    },
  },
};

export const NEUTRAL_NAMES = ["gray", "mauve", "slate", "sage", "olive", "sand"] as const;
export const ACCENT_NAMES = [
  "tomato", "red", "ruby", "crimson", "pink", "plum", "purple",
  "violet", "iris", "indigo", "blue", "cyan", "teal", "jade",
  "green", "grass", "brown", "bronze", "gold", "sky",
] as const;
export const STYLE_NAMES = Object.keys(STYLES);

function mapColors(scale: RadixScale, accentScale: RadixScale, isDark: boolean): Record<string, string> {
  return {
    bg: scale[0],
    surface: scale[0],
    elevated: scale[1],
    fg: scale[11],
    "fg-2": scale[10],
    muted: scale[9],
    disabled: scale[7],
    border: scale[5],
    "border-soft": scale[4],
    accent: accentScale[8],
    "accent-hover": accentScale[7],
    "accent-on": isDark ? "#000000" : "#ffffff",
    "tab-active-bg": scale[11],
    "tab-active-fg": scale[0],
    danger: PALETTES.red[isDark ? "dark" : "light"][8],
    success: PALETTES.green[isDark ? "dark" : "light"][8],
    warn: isDark ? "#fbbf24" : "#f59e0b",
  };
}

export interface GeneratedTheme {
  id: string;
  name: string;
  label: string;
  description: string;
  lightTokens: Record<string, string>;
  darkTokens: Record<string, string>;
  darkAlways: boolean;
}

export function generateTheme(neutral: string, accent: string, style: string, id: string, darkAlways = false): GeneratedTheme {
  const n = PALETTES[neutral];
  const a = PALETTES[accent];
  const s = STYLES[style];
  if (!n || !a || !s) throw new Error(`Invalid palette or style`);

  const scaleKey = darkAlways ? "dark" : "light";
  const lightTokens: Record<string, string> = {
    ...mapColors(n[scaleKey], a[scaleKey], darkAlways),
    ...s.tokens,
  };

  const darkTokens: Record<string, string> = darkAlways
    ? {}
    : mapColors(n.dark, a.dark, true);

  return {
    id,
    name: `${neutral[0].toUpperCase()}${neutral.slice(1)} ${accent}`,
    label: `${neutral}+${accent}`,
    description: `${neutral} · ${accent} · ${style}${darkAlways ? " (dark)" : ""}`,
    lightTokens,
    darkTokens,
    darkAlways,
  };
}

/**
 * Convert token keys (like "fg-2") to CSS custom property names (like "--fg-2").
 */
export function tokensToCssVars(tokens: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined) {
      vars[`--${key}`] = value;
    }
  }
  return vars;
}
