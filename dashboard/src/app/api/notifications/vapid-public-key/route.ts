import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/vapid-public-key
 *
 * Returns the VAPID public key so clients can create PushSubscription objects
 * without exposing the private key. The private key lives only on the server
 * (VAPID_PRIVATE_KEY env var).
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: "VAPID not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, publicKey });
}
