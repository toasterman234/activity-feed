export type ScreenerMode =
  | "live"
  | "composite"
  | "vrp"
  | "fundamental"
  | "momentum"
  | "dividend"
  | "ta";

export type EvidenceTier = "live" | "historical" | "research";

export interface ScreenerFilters {
  minIv: number;
  minOptionVolume: number;
  minContracts: number;
  flowBias: "all" | "put" | "call";
  marketCap: "" | "micro" | "small" | "mid" | "large" | "mega";
  hasOptions: "" | "yes" | "no";
  ivrLevel: "" | "very_low" | "low" | "medium" | "high" | "extreme";
  vrpLevel: "" | "negative" | "positive" | "high";
  piotroskiLevel: "" | "weak" | "average" | "strong";
  debtLevel: "" | "low" | "moderate" | "high";
  momentumLevel: "" | "negative" | "positive" | "strong";
  trendRegime: "" | "bull" | "bear" | "sideways";
  yieldLevel: "" | "any" | "income" | "high";
  rsiSignal: "" | "oversold" | "neutral" | "overbought";
}

export interface ScreenDefinition {
  id: string;
  name: string;
  description: string;
  mode: ScreenerMode;
  evidence: EvidenceTier;
  version: number;
  filters: ScreenerFilters;
}

export const DEFAULT_FILTERS: ScreenerFilters = {
  minIv: 0.3,
  minOptionVolume: 0,
  minContracts: 0,
  flowBias: "all",
  marketCap: "",
  hasOptions: "",
  ivrLevel: "",
  vrpLevel: "",
  piotroskiLevel: "",
  debtLevel: "",
  momentumLevel: "",
  trendRegime: "",
  yieldLevel: "",
  rsiSignal: "",
};

function preset(
  id: string,
  name: string,
  description: string,
  mode: ScreenerMode,
  evidence: EvidenceTier,
  filters: Partial<ScreenerFilters> = {},
): ScreenDefinition {
  return { id, name, description, mode, evidence, version: 1, filters: { ...DEFAULT_FILTERS, ...filters } };
}

export const SCREEN_PRESETS: ScreenDefinition[] = [
  preset("live-options", "Live options", "Public.com chains ranked by near-the-money implied volatility.", "live", "live"),
  preset("high-iv-liquid", "High IV · liquid", "Higher-IV chains with meaningful option activity.", "live", "live", {
    minIv: 0.5,
    minOptionVolume: 1000,
    minContracts: 80,
  }),
  preset("put-flow", "Put flow", "Live chains where put volume is leading call volume.", "live", "live", {
    flowBias: "put",
    minOptionVolume: 500,
  }),
  preset("composite", "Composite", "Cross-factor quality, volatility, momentum, and income rank.", "composite", "historical"),
  preset("vrp-context", "VRP context", "Historical IV rank, volatility premium, skew, and regime context.", "vrp", "research", {
    hasOptions: "yes",
    vrpLevel: "positive",
  }),
  preset("fundamental-quality", "Fundamental quality", "Healthy, resilient businesses suitable for deeper ownership review.", "fundamental", "historical", {
    piotroskiLevel: "strong",
    debtLevel: "low",
  }),
  preset("momentum", "Momentum", "Positive intermediate momentum with supportive trend context.", "momentum", "historical", {
    momentumLevel: "positive",
    trendRegime: "bull",
  }),
  preset("dividend-income", "Dividend income", "Established income names ranked by trailing regular yield.", "dividend", "historical", {
    yieldLevel: "income",
  }),
  preset("technical", "Technical setup", "Technical conditions for exploration—not an options edge claim.", "ta", "historical", {
    rsiSignal: "oversold",
  }),
];

export const SCREENER_STORAGE_KEY = "finance-screener:saved-screens:v1";
