import type { ReactNode } from "react";
import DesktopSidebar from "./sidebar";
import LightWrapper from "./dark-wrapper";

export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <LightWrapper>
      <div className="flex min-h-screen bg-white text-black">
        <DesktopSidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </LightWrapper>
  );
}
