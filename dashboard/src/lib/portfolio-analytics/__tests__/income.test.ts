// ── Unit tests: Income analytics ──

import { describe, it, expect } from "vitest";
import {
  computeRealizedPnL,
  computePremiumCashFlow,
  computeEstimatedCapital,
  computeThetaConcentration,
  computeIncomeStability,
  classifyIncomeSources,
  computeThetaBySymbol,
  generateIncomeForecast,
} from "../income";
import type { NormalizedTrade, NormalizedPosition, AggregatedGreeks } from "../types";

function makeTrade(overrides?: Partial<NormalizedTrade>): NormalizedTrade {
  return {
    tradeId: "t1",
    symbol: "AAPL250117P00180000",
    side: "sell",
    quantity: 1,
    price: 3.50,
    proceeds: 350,
    date: new Date().toISOString().split("T")[0],
    isOption: true,
    optionType: "put",
    optionStrike: 180,
    optionExpiry: "2025-01-17",
    institution: "schwab",
    ...overrides,
  };
}

describe("computeRealizedPnL", () => {
  it("returns zeros for empty trades", () => {
    const result = computeRealizedPnL([]);
    expect(result.today).toBe(0);
    expect(result.mtd).toBe(0);
    expect(result.ytd).toBe(0);
    expect(result.lifetime).toBe(0);
  });

  it("sums proceeds across periods", () => {
    const today = new Date().toISOString().split("T")[0];
    const trades: NormalizedTrade[] = [
      makeTrade({ tradeId: "t1", proceeds: 100, date: today }),
      makeTrade({ tradeId: "t2", proceeds: -50, date: today }),
      // Last month
      makeTrade({
        tradeId: "t3",
        proceeds: 200,
        date: new Date(Date.now() - 40 * 86400000).toISOString().split("T")[0],
      }),
    ];

    const result = computeRealizedPnL(trades);

    expect(result.today).toBe(50); // 100 + (-50)
    expect(result.lifetime).toBe(250); // 100 + (-50) + 200
    expect(result.mtd).toBe(50); // only today's trades are within this month
  });

  it("handles negative proceeds", () => {
    const today = new Date().toISOString().split("T")[0];
    const trades = [makeTrade({ proceeds: -500, date: today })];
    const result = computeRealizedPnL(trades);
    expect(result.today).toBe(-500);
    expect(result.lifetime).toBe(-500);
  });
});

describe("computePremiumCashFlow", () => {
  it("tracks credits from selling options", () => {
    const trades = [
      makeTrade({ tradeId: "t1", side: "sell", proceeds: 350 }),
      makeTrade({ tradeId: "t2", side: "sell", proceeds: 200 }),
    ];
    const result = computePremiumCashFlow(trades);
    expect(result.creditsReceived).toBe(550);
    expect(result.netFlow).toBe(550);
  });

  it("tracks debits from buying options", () => {
    const trades = [makeTrade({ tradeId: "t1", side: "buy", proceeds: -400 })];
    const result = computePremiumCashFlow(trades);
    expect(result.debitsPaid).toBe(400);
    expect(result.netFlow).toBe(-400);
  });

  it("ignores non-option trades", () => {
    const trades = [
      makeTrade({ tradeId: "t1", isOption: false, proceeds: 1000 }),
    ];
    const result = computePremiumCashFlow(trades);
    expect(result.netFlow).toBe(0);
  });
});

describe("computeEstimatedCapital", () => {
  it("sums positive market values", () => {
    const positions: NormalizedPosition[] = [
      {
        symbol: "AAPL",
        quantity: 100,
        avgCost: 180,
        marketPrice: 200,
        marketValue: 20000,
        unrealizedPnL: 2000,
        realizedPnL: 0,
        assetType: "stock",
        institution: "schwab",
        accountName: "Individual",
      },
      {
        symbol: "SPY",
        quantity: 50,
        avgCost: 400,
        marketPrice: 450,
        marketValue: 22500,
        unrealizedPnL: 2500,
        realizedPnL: 0,
        assetType: "stock",
        institution: "schwab",
        accountName: "Individual",
      },
    ];
    expect(computeEstimatedCapital(positions)).toBe(42500);
  });

  it("handles null/negative market values", () => {
    const positions: NormalizedPosition[] = [
      {
        symbol: "FOO",
        quantity: 100,
        avgCost: 180,
        marketPrice: null,
        marketValue: null,
        unrealizedPnL: null,
        realizedPnL: 0,
        assetType: "stock",
        institution: "schwab",
        accountName: "Individual",
      },
    ];
    expect(computeEstimatedCapital(positions)).toBe(0);
  });
});

describe("computeThetaConcentration", () => {
  it("calculates top-N concentration correctly", () => {
    const positionGreeks = [
      { symbol: "AAPL", theta: 15, quantity: -1, optionType: "put" },
      { symbol: "AAPL", theta: 5, quantity: -1, optionType: "call" },
      { symbol: "SPY", theta: 30, quantity: -2, optionType: "put" },
      { symbol: "QQQ", theta: 10, quantity: -1, optionType: "put" },
      { symbol: "IWM", theta: 8, quantity: -1, optionType: "call" },
    ];

    const result = computeThetaConcentration(positionGreeks);

    // Total theta: 68
    // SPY: 30 (44.1%), AAPL: 20 (29.4%), QQQ: 10 (14.7%), IWM: 8 (11.8%)
    expect(result.top1Pct).toBeCloseTo(30 / 68, 2);
    expect(result.top3Pct).toBeCloseTo(60 / 68, 2);
    expect(result.top5Pct).toBeCloseTo(1, 2);
    expect(result.topSymbols[0].symbol).toBe("SPY");
    expect(result.topSymbols[0].theta).toBe(30);
  });

  it("returns zeros for empty input", () => {
    const result = computeThetaConcentration([]);
    expect(result.top1Pct).toBe(0);
    expect(result.topSymbols).toHaveLength(0);
  });
});

describe("computeIncomeStability", () => {
  it("returns null for empty trades", () => {
    expect(computeIncomeStability([])).toBeNull();
  });

  it("computes weekly and monthly stats", () => {
    const today = new Date();
    const trades: NormalizedTrade[] = [];

    // Generate 4 weeks of daily trades
    for (let i = 0; i < 28; i++) {
      const date = new Date(today.getTime() - i * 86400000);
      trades.push(
        makeTrade({
          tradeId: `t${i}`,
          proceeds: i % 2 === 0 ? 100 : -20, // alternating profitable/loss
          date: date.toISOString().split("T")[0],
        }),
      );
    }

    const result = computeIncomeStability(trades);
    expect(result).not.toBeNull();
    if (result) {
      // Every week has both profit and loss days
      expect(result.weekly.periodCount).toBeGreaterThan(0);
      // Some weeks should be net positive
      expect(result.weekly.positivePct).toBeGreaterThan(0);
      expect(result.weekly.avgAmount).toBeGreaterThan(0);
    }
  });
});

describe("classifyIncomeSources", () => {
  it("classifies short puts", () => {
    const trades = [makeTrade({ side: "sell", optionType: "put", proceeds: 350 })];
    const result = classifyIncomeSources(trades, []);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("short_put");
    expect(result[0].label).toBe("Short Puts");
    expect(result[0].amount).toBe(350);
  });

  it("classifies covered calls", () => {
    const trades = [makeTrade({ side: "sell", optionType: "call", proceeds: 200 })];
    const result = classifyIncomeSources(trades, []);
    expect(result[0].source).toBe("covered_call");
    expect(result[0].label).toBe("Covered Calls");
  });

  it("classifies stock gains", () => {
    const trades = [makeTrade({ isOption: false, proceeds: 500 })];
    const result = classifyIncomeSources(trades, []);
    expect(result[0].source).toBe("stock_gains");
  });
});

describe("computeThetaBySymbol", () => {
  it("groups theta by symbol", () => {
    const positionGreeks = [
      {
        symbol: "AAPL",
        quantity: -1,
        optionType: "put" as const,
        strike: 180,
        expiration: "2025-01-17",
        delta: 30,
        gamma: -2,
        theta: 15,
        vega: -25,
        rho: 5,
        deltaDollars: 6000,
        greeksAvailable: true,
        greekSource: "market-lake" as const,
      },
      {
        symbol: "AAPL",
        quantity: -1,
        optionType: "call" as const,
        strike: 210,
        expiration: "2025-01-17",
        delta: -20,
        gamma: -1,
        theta: 8,
        vega: -15,
        rho: -3,
        deltaDollars: -4000,
        greeksAvailable: true,
        greekSource: "market-lake" as const,
      },
    ];

    const result = computeThetaBySymbol(positionGreeks);
    expect(result).toHaveLength(1); // grouped by AAPL
    expect(result[0].symbol).toBe("AAPL");
    expect(result[0].thetaPerDay).toBe(23); // 15 + 8
    expect(result[0].pct).toBe(1);
  });
});

describe("generateIncomeForecast", () => {
  it("generates four forecast scenarios", () => {
    const forecast = generateIncomeForecast(50, [
      { symbol: "AAPL", expiry: "2025-01-17", theta: 15 },
    ]);
    expect(forecast).toHaveLength(4);

    // Current-theta: 50 × 21 = 1050
    expect(forecast[0].scenario).toBe("current-theta");
    expect(forecast[0].estimatedMonthlyIncome).toBe(1050);

    // Conservative: 1050 × 0.6 = 630
    expect(forecast[1].scenario).toBe("conservative");
    expect(forecast[1].estimatedMonthlyIncome).toBe(630);

    // Base: 1050 × 0.8 = 840
    expect(forecast[2].estimatedMonthlyIncome).toBe(840);

    // Optimistic: 1050
    expect(forecast[3].estimatedMonthlyIncome).toBe(1050);
  });
});
