"use client";

// Enable phone notifications — inline subscription management widget.
// Uses the Web Push API (navigator.serviceWorker + pushManager) to register
// a PushSubscription, sends it to POST /api/notifications/subscribe, then
// confirms delivery via POST /api/notifications/test-delivery.

import { useCallback, useEffect, useState } from "react";

interface Subscription {
  id: string;
  device_name: string;
  endpoint: string;
  created_at: string;
  last_used_at: string;
}

type Stage = "idle" | "requesting" | "subscribing" | "naming" | "testing" | "done" | "error" | "unavailable";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return buf;
}

export default function EnableNotifications() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [deviceName, setDeviceName] = useState<string>("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  // Check support on mount
  useEffect(() => {
    const sw = "serviceWorker" in navigator;
    const pm = "PushManager" in window;
    const notif = "Notification" in window;
    setSupported(sw && pm && notif);
    setPermission(notif ? Notification.permission : null);
  }, []);

  // Load existing subscriptions
  const loadSubscriptions = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/subscriptions");
      const data = await res.json();
      if (data.ok) setSubscriptions(data.subscriptions || []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (supported) loadSubscriptions();
  }, [supported, loadSubscriptions]);

  const handleEnable = async () => {
    setStage("requesting");
    setError(null);

    // 1. Request notification permission
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setError("Notification permission denied. Enable notifications in your browser settings.");
        setStage("error");
        return;
      }
    } catch (err) {
      setError("Could not request notification permission.");
      setStage("error");
      return;
    }

    // 2. Subscribe to push
    setStage("subscribing");
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await fetch("/api/notifications/vapid-public-key");
      const vapidData = await vapidRes.json();
      if (!vapidData.ok) {
        setError("Push notifications are not configured on the server.");
        setStage("error");
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      // 3. Register on server
      setStage("naming");
      // We'll POST with a default name; user can rename
      const name = deviceName.trim() || detectDeviceName();
      setDeviceName(name);

      const subBody = subscription.toJSON();
      if (!subBody.endpoint || !subBody.keys?.p256dh || !subBody.keys?.auth) {
        setError("Browser returned incomplete subscription.");
        setStage("error");
        return;
      }

      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subBody,
          deviceName: name,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to register subscription.");
        setStage("error");
        return;
      }

      // 4. Test delivery
      setStage("testing");
      const testRes = await fetch("/api/notifications/test-delivery", { method: "POST" });
      const testData = await testRes.json();
      if (testData.ok) {
        setStage("done");
      } else {
        setError("Subscribed, but test notification failed. Push may still work — try sending a test.");
        setStage("done");
      }

      await loadSubscriptions();
    } catch (err) {
      setError(String(err));
      setStage("error");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadSubscriptions();
    } catch {
      setError("Failed to remove subscription.");
    }
  };

  const handleTestDelivery = async () => {
    setStage("testing");
    try {
      const testRes = await fetch("/api/notifications/test-delivery", { method: "POST" });
      const testData = await testRes.json();
      if (testData.ok) {
        setStage("done");
        setError(null);
      } else {
        setError(testData.error || "Test delivery failed.");
        setStage("error");
      }
    } catch (err) {
      setError(String(err));
      setStage("error");
    }
  };

  const handleRename = async (id: string, newName: string) => {
    // Simple rename: re-subscribe with new name (same endpoint overwrites)
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) return;
    try {
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: { endpoint: sub.endpoint },
          deviceName: newName,
        }),
      });
      await loadSubscriptions();
    } catch {
      setError("Failed to rename device.");
    }
  };

  if (supported === null) return <div className="animate-pulse h-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />;

  return (
    <div className="space-y-3">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Phone Notifications</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {subscriptions.length > 0
              ? `${subscriptions.length} device${subscriptions.length === 1 ? "" : "s"} registered`
              : "Not enabled"}
          </p>
        </div>
        {!supported ? (
          <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
            Unavailable
          </span>
        ) : permission === "denied" ? (
          <span className="text-[10px] text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-full px-2 py-0.5">
            Blocked
          </span>
        ) : (
          <button
            onClick={handleEnable}
            disabled={stage === "requesting" || stage === "subscribing" || stage === "testing"}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {subscriptions.length > 0 ? "Add Device" : "Enable"}
          </button>
        )}
      </div>

      {/* Device naming */}
      {stage === "naming" && !deviceName && (
        <input
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleEnable()}
          placeholder="iPhone 15 Pro"
          className="w-full rounded-lg border border-zinc-200 bg-card px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
          autoFocus
        />
      )}

      {/* Progress */}
      {stage !== "idle" && stage !== "done" && stage !== "error" && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          {stage === "requesting" && "Requesting permission…"}
          {stage === "subscribing" && "Registering with push service…"}
          {stage === "naming" && "Saving subscription…"}
          {stage === "testing" && "Sending test notification…"}
        </div>
      )}

      {/* Success */}
      {stage === "done" && !error && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
          Notifications enabled! {subscriptions.length > 0 && "Test notification sent."}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Device list */}
      {subscriptions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Registered Devices</p>
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-card px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {sub.device_name}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
                </div>
                <p className="text-[10px] text-zinc-400 truncate">
                  {new Date(sub.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const name = prompt("Device name:", sub.device_name);
                    if (name) handleRename(sub.id, name);
                  }}
                  className="rounded px-1.5 py-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  title="Rename"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleRemove(sub.id)}
                  className="rounded px-1.5 py-1 text-[10px] text-zinc-400 hover:text-red-500"
                  title="Remove"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={handleTestDelivery}
            className="w-full rounded-lg border border-zinc-200 bg-card px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Send Test Notification
          </button>
        </div>
      )}

      {/* Unsupported */}
      {supported === false && (
        <div
          className="rounded-lg bg-white px-3 py-2 text-xs !text-black dark:bg-white dark:!text-black"
          style={{ color: "#000000", WebkitTextFillColor: "#000000" }}
        >
          Push notifications require a supported browser (Chrome, Edge, or PWA-installed Safari ≥16.4).
        </div>
      )}
    </div>
  );
}

function detectDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown Device";
  const ua = navigator.userAgent || "";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android Phone";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows PC";
  return "Browser";
}
