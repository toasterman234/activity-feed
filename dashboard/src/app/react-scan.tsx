"use client";

// Dev-only render profiler. See docs/decisions/ADR-002-react-scan-dev-profiling.md
// Import scan before React per react-scan's Next.js App Router guidance.
import { scan } from "react-scan";
import { useEffect } from "react";

export default function ReactScan() {
  useEffect(() => {
    // In production builds react-scan is aliased to an empty module
    // (next.config.ts), so `scan` is undefined there — never call it.
    if (typeof scan !== "function") return;
    scan({ enabled: false });
  }, []);

  return null;
}
