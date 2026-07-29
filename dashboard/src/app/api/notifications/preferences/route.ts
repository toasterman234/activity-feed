import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

const VALID_SCOPES = ["global", "event_type", "channel", "project", "workflow", "agent", "task"] as const;

const EVENT_TYPES = [
  "workflow.blocked",
  "workflow.approval_required",
  "work_run.completed",
  "work_run.failed",
  "work_run.interrupted",
  "verification.passed",
  "verification.failed",
  "deployment.completed",
  "deployment.failed",
  "task.reply",
] as const;

const USER_ID = "operator";

type PrefRow = {
  id: string;
  user_id: string;
  scope: string;
  scope_value: string | null;
  enabled: boolean;
  delivery_mode: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  lock_screen_preview: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/notifications/preferences
 *
 * Return all preferences for the operator, plus a computed effective config
 * so the UI can show what each event type would do.
 */
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, user_id, scope, scope_value, enabled, delivery_mode,
              quiet_hours_start, quiet_hours_end, lock_screen_preview,
              created_at, updated_at
         FROM notification_preferences
        WHERE user_id = $1
        ORDER BY scope, scope_value`,
      [USER_ID],
    );

    const rows: PrefRow[] = result.rows;
    return NextResponse.json({
      ok: true,
      preferences: rows,
      effective: computeEffective(rows),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * PUT /api/notifications/preferences
 *
 * Upsert a preference. Body: { scope, scope_value?, enabled?, delivery_mode?,
 * quiet_hours_start?, quiet_hours_end?, lock_screen_preview? }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.scope) {
      return NextResponse.json({ ok: false, error: "scope required" }, { status: 400 });
    }

    const scope = String(body.scope);
    if (!VALID_SCOPES.includes(scope as typeof VALID_SCOPES[number])) {
      return NextResponse.json(
        { ok: false, error: `Invalid scope. One of: ${VALID_SCOPES.join(", ")}` },
        { status: 400 },
      );
    }

    const scopeValue = body.scope_value != null ? String(body.scope_value) : null;

    // Fetch existing
    const existing = await pool.query(
      `SELECT id FROM notification_preferences
        WHERE user_id = $1 AND scope = $2 AND scope_value IS NOT DISTINCT FROM $3`,
      [USER_ID, scope, scopeValue],
    );

    const now = new Date().toISOString();
    let id: string;

    if (existing.rows.length > 0) {
      id = existing.rows[0].id;
      // Update existing
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(Boolean(body.enabled)); }
      if (body.delivery_mode !== undefined) {
        const mode = String(body.delivery_mode);
        if (!["immediate", "digest"].includes(mode)) {
          return NextResponse.json({ ok: false, error: "delivery_mode must be immediate or digest" }, { status: 400 });
        }
        fields.push(`delivery_mode = $${idx++}`);
        values.push(mode);
      }
      if (body.quiet_hours_start !== undefined) { fields.push(`quiet_hours_start = $${idx++}`); values.push(body.quiet_hours_start == null ? null : String(body.quiet_hours_start)); }
      if (body.quiet_hours_end !== undefined) { fields.push(`quiet_hours_end = $${idx++}`); values.push(body.quiet_hours_end == null ? null : String(body.quiet_hours_end)); }
      if (body.lock_screen_preview !== undefined) { fields.push(`lock_screen_preview = $${idx++}`); values.push(Boolean(body.lock_screen_preview)); }

      if (fields.length > 0) {
        fields.push(`updated_at = $${idx++}`);
        values.push(now);
        values.push(id);
        await pool.query(
          `UPDATE notification_preferences SET ${fields.join(", ")} WHERE id = $${idx}`,
          values,
        );
      }
    } else {
      // Insert new
      id = randomUUID();
      await pool.query(
        `INSERT INTO notification_preferences (id, user_id, scope, scope_value, enabled, delivery_mode,
           quiet_hours_start, quiet_hours_end, lock_screen_preview, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [
          id,
          USER_ID,
          scope,
          scopeValue,
          body.enabled !== undefined ? Boolean(body.enabled) : true,
          body.delivery_mode != null ? String(body.delivery_mode) : "immediate",
          body.quiet_hours_start != null ? String(body.quiet_hours_start) : null,
          body.quiet_hours_end != null ? String(body.quiet_hours_end) : null,
          body.lock_screen_preview !== undefined ? Boolean(body.lock_screen_preview) : true,
          now,
        ],
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications/preferences
 *
 * Delete a specific preference. Body: { scope, scope_value? }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const scope = String(body?.scope || "");
    const scopeValue = body?.scope_value != null ? String(body.scope_value) : null;

    if (!scope) {
      return NextResponse.json({ ok: false, error: "scope required" }, { status: 400 });
    }

    await pool.query(
      `DELETE FROM notification_preferences
        WHERE user_id = $1 AND scope = $2 AND scope_value IS NOT DISTINCT FROM $3`,
      [USER_ID, scope, scopeValue],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * Compute effective settings for each event type.
 * Scope precedence: task > agent > workflow > project > channel > event_type > global.
 */
function computeEffective(prefs: PrefRow[]): Record<string, { enabled: boolean; delivery_mode: string }> {
  const global = prefs.find((p) => p.scope === "global" && p.scope_value == null);
  const defaultEnabled = global?.enabled ?? true;
  const defaultMode = global?.delivery_mode ?? "immediate";

  const effective: Record<string, { enabled: boolean; delivery_mode: string }> = {};
  for (const ev of EVENT_TYPES) {
    // Find most specific preference for this event type
    const eventPref = prefs.find((p) => p.scope === "event_type" && p.scope_value === ev);
    effective[ev] = {
      enabled: eventPref?.enabled ?? defaultEnabled,
      delivery_mode: eventPref?.delivery_mode ?? defaultMode,
    };
  }
  return effective;
}
