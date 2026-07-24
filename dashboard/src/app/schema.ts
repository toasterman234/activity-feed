import type { Schema } from "@electric-circuits/protocol";

export const schema: Schema = {
  tables: {
    activity_log: {
      columns: {
        id: { type: "int" },
        source: { type: "text" },
        type: { type: "text" },
        summary: { type: "text" },
        detail: { type: "text" },
        created_at: { type: "text" },
      },
      primaryKey: "id",
    },
    portfolio_positions: {
      columns: {
        id: { type: "text" },
        symbol: { type: "text" },
        name: { type: "text" },
        qty: { type: "float" },
        price: { type: "float" },
        market_value: { type: "float" },
        asset_class: { type: "text" },
        institution: { type: "text" },
        account_name: { type: "text" },
        account_kind: { type: "text" },
        position_kind: { type: "text" },
        as_of_date: { type: "text" },
        updated_at: { type: "text" },
      },
      primaryKey: "id",
    },
    portfolio_trades: {
      columns: {
        trade_id: { type: "text" },
        symbol: { type: "text" },
        description: { type: "text" },
        side: { type: "text" },
        quantity: { type: "float" },
        price: { type: "float" },
        proceeds: { type: "float" },
        date: { type: "text" },
        is_option: { type: "bool" },
        option_type: { type: "text" },
        option_strike: { type: "float" },
        option_expiry: { type: "text" },
        institution: { type: "text" },
        updated_at: { type: "text" },
      },
      primaryKey: "trade_id",
    },
    portfolio_balances: {
      columns: {
        account_id: { type: "text" },
        institution: { type: "text" },
        type: { type: "text" },
        balance: { type: "float" },
        as_of_date: { type: "text" },
        updated_at: { type: "text" },
      },
      primaryKey: "account_id",
    },
    portfolio_net_worth: {
      columns: {
        date: { type: "text" },
        total_assets: { type: "float" },
        total_liabilities: { type: "float" },
        net_worth: { type: "float" },
        cash: { type: "float" },
        invested: { type: "float" },
        by_asset_class: { type: "text" },
        updated_at: { type: "text" },
      },
      primaryKey: "date",
    },
    portfolio_benchmarks: {
      columns: {
        symbol: { type: "text" },
        date: { type: "text" },
        close: { type: "float" },
        updated_at: { type: "text" },
      },
      primaryKey: "symbol,date",
    },
    portfolio_allocation: {
      columns: {
        asset_class: { type: "text" },
        market_value: { type: "float" },
        target_pct: { type: "float" },
        current_pct: { type: "float" },
        drift_pct: { type: "float" },
        updated_at: { type: "text" },
      },
      primaryKey: "asset_class",
    },
  },
};
