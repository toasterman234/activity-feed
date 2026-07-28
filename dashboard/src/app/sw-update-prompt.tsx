"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Listens for Serwist's "waiting" event (new service worker installed
 * and waiting to activate). Shows a dismissible banner so the user can
 * reload on their own terms — we never force-reload a live financial
 * dashboard mid-session.
 */
export default function SWUpdatePrompt() {
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const reload = useCallback(() => {
    setWaiting(false);
    // Tell the waiting SW to skip waiting, then reload
    window.serwist?.messageSW({ type: "SKIP_WAITING" });
  }, []);

  const dismiss = useCallback(() => {
    setWaiting(false);
    setDismissed(true);
  }, []);

  useEffect(() => {
    // Need Serwist's auto-injected script to have run first.
    // It sets window.serwist during registration.
    const check = () => {
      if (!window.serwist) {
        // Poll briefly — Serwist's injected script runs early
        // but may not have resolved registration yet.
        const t = setTimeout(check, 1000);
        return () => clearTimeout(t);
      }

      const handleWaiting = () => {
        if (!dismissed) setWaiting(true);
      };

      // If a SW is already waiting when we mount, show the banner.
      if (
        window.serwist &&
        typeof (window.serwist as any).waiting !== "undefined" &&
        (window.serwist as any).waiting
      ) {
        handleWaiting();
      }

      window.serwist.addEventListener("waiting", handleWaiting);
      return () => {
        window.serwist?.removeEventListener("waiting", handleWaiting);
      };
    };

    return check();
  }, [dismissed]);

  if (!waiting) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 mx-auto max-w-lg px-3 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs shadow-lg dark:border-blue-800 dark:bg-blue-950">
        <span className="flex-1 text-blue-800 dark:text-blue-200">
          New version available
        </span>
        <button
          onClick={reload}
          className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Reload
        </button>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md px-1.5 py-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
