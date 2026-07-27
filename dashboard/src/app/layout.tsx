// ReactScan must be the top-most import (react-scan before React). See ADR-002.
import ReactScan from "./react-scan";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "./bottom-nav";
import SWUpdatePrompt from "./sw-update-prompt";
import InstallPrompt from "./install-prompt";
import PerfMonitors from "./perf-monitors";

export const metadata: Metadata = {
  title: "Finance Dashboard",
  description: "Real-time portfolio with Electric Circuits sync + Market Lake",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Finance",
  },
  icons: {
    icon: "/icon-192.png",
    // TODO: replace with a proper 180×180 PNG when source art is available
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
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
      <body className="min-h-full bg-zinc-50 dark:bg-zinc-950 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <ReactScan />
        <PerfMonitors />
        <main>{children}</main>
        <BottomNav />
        <SWUpdatePrompt />
        <InstallPrompt />
      </body>
    </html>
  );
}
