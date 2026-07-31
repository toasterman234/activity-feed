// ReactScan must be the top-most import (react-scan before React). See ADR-002.
import ReactScan from "./react-scan";
import type { Metadata, Viewport } from "next";
import "../../themes/generated.css";
import BottomNav from "./bottom-nav";
import SWUpdatePrompt from "./sw-update-prompt";
import PerfMonitors from "./perf-monitors";
import ProtoThemePicker from "@/components/ProtoThemePicker";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
      className={cn("h-full antialiased", "font-sans", geist.variable)}
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
        <TooltipProvider>
          <ReactScan />
          <PerfMonitors />
          <main>{children}</main>
          <BottomNav />
          <SWUpdatePrompt />
          {process.env.NODE_ENV === "development" && <ProtoThemePicker />}
        </TooltipProvider>
      </body>
    </html>
  );
}
