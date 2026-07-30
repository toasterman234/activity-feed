"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/ops";

  return (
    <div className="mx-auto max-w-5xl">
      {pathname !== "/ops" && (
        <div className="sticky top-0 z-10 border-b border-border bg-background/90 px-3 py-2 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
          <Link href="/ops" className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
            ← Ops
          </Link>
        </div>
      )}
      {children}
    </div>
  );
}
