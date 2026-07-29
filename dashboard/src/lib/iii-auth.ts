import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Bearer token for iii → dashboard task API. Set DASHBOARD_III_TOKEN on OVH. */
export function requireIiiToken(req: NextRequest): NextResponse | null {
  const expected = process.env.DASHBOARD_III_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "DASHBOARD_III_TOKEN is not configured", code: "unauthorized" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1]?.trim() || "";
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
