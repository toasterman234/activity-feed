"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function Icon({ d }: { d: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const overviewIcon = "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10";
const barChartIcon = "M3 3v18h18 M18 17V9 M13 17V5 M8 17v-3";
const lineChartIcon = "M3 3v18h18 M3 16l4-4 4 4 4-6 4 2";
const searchIcon = "M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z";
const trendIcon = "M22 12l-3-3-7 7-4-4-5 5 M17 9h4v4";
const compassIcon = "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z M12 4.5v15 M4.5 12h15";
const pieChartIcon = "M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z";
const shieldIcon = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";

const NAV = [
  { href: "/desktop", label: "Overview", icon: overviewIcon },
  { href: "/desktop/portfolio", label: "Portfolio", icon: barChartIcon },
  { href: "/desktop/watchlist", label: "Watchlist", icon: lineChartIcon },
  { href: "/desktop/screener", label: "Screener", icon: searchIcon },
  { href: "/desktop/research", label: "Research", icon: compassIcon },
  { href: "/desktop/analytics", label: "Analytics", icon: pieChartIcon },
  { href: "/desktop/hedges", label: "Hedges", icon: shieldIcon },
] as const;

export default function DesktopSidebar() {
  const pathname = usePathname() || "/desktop";

  return (
    <aside className="w-[220px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Icon d={trendIcon} />
          </div>
          <div>
            <p className="text-sm font-semibold text-black">Activity</p>
            <p className="text-[10px] text-gray-500">Desktop Terminal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map((item) => {
          const active =
            item.href === "/desktop"
              ? pathname === "/desktop"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-gray-200 text-black"
                  : "text-gray-600 hover:bg-gray-100 hover:text-black"
              )}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <p className="text-[10px] text-gray-400">
          Live data via Electric · Market data via Polygon.io
        </p>
      </div>
    </aside>
  );
}
