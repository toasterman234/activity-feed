// ReactScan must be the top-most import (react-scan before React). See ADR-002.
import ReactScan from "./react-scan";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "./bottom-nav";
import SWUpdatePrompt from "./sw-update-prompt";
import InstallPrompt from "./install-prompt";
import PerfMonitors from "./perf-monitors";
import ThemeSwitcher from "./theme-switcher";
import ProtoThemePicker from "@/components/ProtoThemePicker";

export const metadata: Metadata = {
  title: "Activity",
  description: "Workflow and agent activity dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Activity",
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
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // 1. Restore persistent theme from localStorage
                  var theme = localStorage.getItem('data-theme');
                  if (theme) {
                    document.documentElement.setAttribute('data-theme', theme);
                  }
                  // 2. Restore prototype theme from sessionStorage (theme-lab live apply)
                  var proto = sessionStorage.getItem('__proto_theme');
                  if (proto) {
                    var data = JSON.parse(proto);
                    var vars = data.vars;
                    for (var key in vars) {
                      document.documentElement.style.setProperty(key, vars[key]);
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans pb-[calc(var(--bottom-nav-height)+1rem+env(safe-area-inset-bottom))]">
        <ReactScan />
        <PerfMonitors />
        <main>{children}</main>
        <BottomNav />
        <SWUpdatePrompt />
        <InstallPrompt />
        <ThemeSwitcher />
        {process.env.NODE_ENV === "development" && <ProtoThemePicker />}
      </body>
    </html>
  );
}
