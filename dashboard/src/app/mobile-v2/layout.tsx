import "./_styles/azure-mono-v2.css";
import type { ReactNode } from "react";
import V2SidebarShell from "./_components/V2SidebarShell";

export default function MobileV2Layout({ children }: { children: ReactNode }) {
  return <div className="overflow-x-hidden bg-[#fcfcfc]"><V2SidebarShell>{children}</V2SidebarShell></div>;
}
