import assert from "node:assert/strict";
import {
  analyzeTrade,
  expirationPnL,
  scenarioPnL,
  selectTradeContracts,
} from "../src/app/finance/trade-lab-model.ts";

const put = {
  symbol: "TEST",
  side: "put",
  strike: 95,
  bid: 2,
  ask: 2.2,
  mid: 2.1,
  delta: -0.3,
  gamma: 0.02,
  theta: -0.04,
  vega: 0.1,
  open_interest: 500,
};
const call = { ...put, side: "call", strike: 105, delta: 0.3 };

const csp = { structure: "csp", spot: 100, quantity: 1, contract: put, fill: 2 };
assert.deepEqual(
  Object.fromEntries(Object.entries(analyzeTrade(csp)).slice(0, 4)),
  { maxProfit: 200, maxLoss: 9300, breakeven: 93, capitalAtRisk: 9500 },
);
assert.equal(expirationPnL(csp, 100), 200);
assert.equal(expirationPnL(csp, 90), -300);

const coveredCall = { structure: "covered_call", spot: 100, quantity: 1, contract: call, fill: 2 };
assert.equal(analyzeTrade(coveredCall).maxProfit, 700);
assert.equal(expirationPnL(coveredCall, 110), 700);
assert.equal(expirationPnL(coveredCall, 90), -800);

assert.equal(analyzeTrade({ structure: "stock", spot: 100, quantity: 1, contract: null, fill: 0 }).maxLoss, 10_000);
assert.equal(selectTradeContracts([call, put], "csp", 100)[0], put);
assert.ok(Number.isFinite(scenarioPnL(csp, -0.05, 5, 7)));

console.log("PASS Trade Lab payoff, risk, selection, and scenario math");
