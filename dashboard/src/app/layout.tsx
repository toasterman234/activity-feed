import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Dashboard",
  description: "Real-time portfolio with Electric Circuits sync + Market Lake",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
        <nav className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto max-w-6xl px-6 py-3">
            <div className="flex items-center gap-6 overflow-x-auto">
              <Link
                href="/"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Activity
              </Link>
              <Link
                href="/portfolio"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Portfolio
              </Link>
              <Link
                href="/watchlist"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Watchlist
              </Link>
              <Link
                href="/trades"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Trades
              </Link>
              <Link
                href="/research"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Research
              </Link>
              <Link
                href="/screener"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Screener
              </Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto w-full max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
