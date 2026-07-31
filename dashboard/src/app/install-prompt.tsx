"use client";

import { useEffect, useState, useCallback } from "react";

const DISMISSED_KEY = "pwa-install-dismissed";

/**
 * Android/Chrome: listens for `beforeinstallprompt` and shows a small banner.
 * iOS Safari: `beforeinstallprompt` never fires, so we detect iOS Safari outside
 * standalone mode and show a static instructional banner instead.
 *
 * Dismiss is persisted in localStorage — once dismissed, the banner won't
 * reappear until the user clears browser storage.
 */
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  // SSR guard — only run effects client-side
  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // Whether they installed or dismissed the native prompt, hide our banner
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  useEffect(() => {
    if (!mounted) return;

    // Already installed — nothing to do
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Already dismissed
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {}

    let cancelled = false;
    const delayMs = 8000;
    let promptHandler: ((e: Event) => void) | null = null;

    const timer = window.setTimeout(() => {
      if (cancelled) return;

      // iOS Safari detection: no beforeinstallprompt, show manual instructions
      const ua = navigator.userAgent;
      const isIOSDevice =
        /iPad|iPhone|iPod/.test(ua) &&
        !(window as any).MSStream;
      if (isIOSDevice) {
        setIsIOS(true);
        setShow(true);
        return;
      }

      // Android/Chrome: if event already deferred somehow, show; else listen
      promptHandler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", promptHandler);
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (promptHandler) {
        window.removeEventListener("beforeinstallprompt", promptHandler);
      }
    };
  }, [mounted]);

  if (!show || !mounted) return null;

  return (
    <div data-install-prompt className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto max-w-lg rounded-lg border border-zinc-200 bg-card px-3 py-2.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        {isIOS ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-zinc-600 dark:text-zinc-300">
              Tap <span className="font-medium">Share</span> then{" "}
              <span className="font-medium">Add to Home Screen</span>
            </span>
            <button
              onClick={dismiss}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-zinc-600 dark:text-zinc-300">
              Install this app on your device
            </span>
            <button
              onClick={install}
              className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
