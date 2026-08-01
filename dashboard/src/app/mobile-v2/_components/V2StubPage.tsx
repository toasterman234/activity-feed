"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function V2StubPage({
  eyebrow,
  title,
  description,
  productionHref,
  productionLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  productionHref: string;
  productionLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/mobile-v2/ops" className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"><ArrowLeft className="size-4" /> Back to Ops</Link>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">{eyebrow}</p>
        <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
      </div>

      <Card size="sm" className="v2-surface py-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Stub status</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4 text-[var(--muted-foreground)]">
            <div className="flex items-center gap-2 text-[var(--foreground)]"><Wrench className="size-4 text-[var(--primary)]" /> This page is intentionally a placeholder for now.</div>
            <p className="mt-2">The route exists in `mobile-v2` so navigation is complete while the real surface is built later.</p>
          </div>
          <Link href={productionHref} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)]">
            <span>{productionLabel}</span>
            <ExternalLink className="size-4 text-[var(--primary)]" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
