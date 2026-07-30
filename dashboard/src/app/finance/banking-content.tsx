"use client";

import { useEffect, useState } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { client, BALANCES_SHAPE, TRANSACTIONS_SHAPE } from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";

interface Balance {
  account_id: string; institution: string; type: string; balance: number;
}

interface Transaction {
  txn_id: string; account_id: string; institution: string; date: string;
  amount: number; merchant: string; raw_description: string; category: string;
}

const PAGE_SIZE = 50;

function useRows<T>(mat: ShapeMaterialization): T[] {
  const coll = mat.collection as Collection<Record<string, unknown>, string>;
  const { data } = useLiveQuery(
    (q: any) => q.from({ t: coll }).select(({ t }: any) => t),
    [coll],
  );
  return (data ?? []) as T[];
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

const TYPE_LABELS: Record<string, string> = {
  checking: "Checking", savings: "Savings", credit: "Credit Card", brokerage_cash: "Brokerage Cash",
};

export default function BankingContent() {
  const [balShape, setBalShape] = useState<ShapeMaterialization | null>(null);
  const [txnShape, setTxnShape] = useState<ShapeMaterialization | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [bal, txn] = await Promise.all([
        acquireShape("balances", () => client.shape(BALANCES_SHAPE)),
        acquireShape("transactions", () => client.shape(TRANSACTIONS_SHAPE)),
      ]);
      if (!alive) return;
      setBalShape(bal);
      setTxnShape(txn);
    })();
    return () => {
      alive = false;
      releaseShape("balances");
      releaseShape("transactions");
    };
  }, []);

  if (!balShape || !txnShape) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">Connecting…</div>;
  }

  return <BankingView balShape={balShape} txnShape={txnShape} />;
}

function BankingView({ balShape, txnShape }: { balShape: ShapeMaterialization; txnShape: ShapeMaterialization }) {
  const balances = useRows<Balance>(balShape);
  const transactions = useRows<Transaction>(txnShape);
  const [page, setPage] = useState(0);

  const bankAccounts = balances.filter((b) => b.type === "checking" || b.type === "savings");
  const creditAccounts = balances.filter((b) => b.type === "credit");

  const sortedTxns = transactions.slice().sort((a, b) => b.date.localeCompare(a.date));
  const pageCount = Math.ceil(sortedTxns.length / PAGE_SIZE);
  const pageRows = sortedTxns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Bank balances */}
      <section className="rounded-xl border border-zinc-200 bg-card dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">Bank Accounts</h2>
        </div>
        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
          {bankAccounts.length === 0 && (
            <p className="px-4 py-3 text-sm text-zinc-400">No bank accounts</p>
          )}
          {bankAccounts.map((b) => (
            <div key={b.account_id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{b.institution}</p>
                <p className="text-[10px] text-zinc-400">{TYPE_LABELS[b.type] ?? b.type}</p>
              </div>
              <p className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">{fmt(b.balance)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Credit card balances */}
      <section className="rounded-xl border border-zinc-200 bg-card dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">Credit Cards</h2>
        </div>
        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
          {creditAccounts.length === 0 && (
            <p className="px-4 py-3 text-sm text-zinc-400">No credit cards</p>
          )}
          {creditAccounts.map((b) => (
            <div key={b.account_id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{b.institution}</p>
                <p className="text-[10px] text-zinc-400">Credit Card</p>
              </div>
              <p className={`font-mono text-sm font-semibold ${b.balance > 0 ? "text-red-500" : "text-zinc-800 dark:text-zinc-200"}`}>
                {fmt(b.balance)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent transactions / history */}
      <section className="rounded-xl border border-zinc-200 bg-card dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">Transaction History · {sortedTxns.length}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Merchant</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Institution</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t) => (
                <tr key={t.txn_id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500">{t.date?.slice(0, 10)}</td>
                  <td className="px-4 py-2 max-w-[160px] truncate text-zinc-800 dark:text-zinc-200">{t.merchant || t.raw_description || "—"}</td>
                  <td className="px-4 py-2 text-xs capitalize text-zinc-500">{t.category?.replace(/_/g, " ") || "—"}</td>
                  <td className="px-4 py-2 text-xs text-zinc-400">{t.institution || "—"}</td>
                  <td className={`px-4 py-2 text-right font-mono ${t.amount < 0 ? "text-emerald-600" : "text-zinc-700 dark:text-zinc-300"}`}>{fmt(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400">Prev</button>
            <span className="text-xs text-zinc-400">{page + 1} / {pageCount}</span>
            <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page === pageCount - 1} className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400">Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
