import type { ReactNode } from "react";
import MobileNav from "./_components/MobileNav";

export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1a2337,transparent_32%),linear-gradient(180deg,#0b1020_0%,#09090b_100%)] text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <div className="flex-1 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">{children}</div>
        <MobileNav />
      </div>
    </div>
  );
}
