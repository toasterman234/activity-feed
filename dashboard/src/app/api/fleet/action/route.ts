import { NextRequest, NextResponse } from "next/server";
import { buildFleetSnapshot } from "@/lib/fleet-server";
import { FLEET_HOSTS, hostById, safeCommandForHost, type FleetActionId, type FleetHostId } from "@/lib/fleet";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set<FleetActionId>(["inspect", "open-session", "open-shell", "open-paseo", "open-cronicle"]);

type FleetActionRequest = {
  hostId?: FleetHostId;
  action?: FleetActionId;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as FleetActionRequest;
    const hostId = body.hostId;
    const action = body.action;

    if (!hostId || !hostById(FLEET_HOSTS, hostId)) {
      return NextResponse.json({ ok: false, error: "missing or unknown hostId" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ ok: false, error: "missing action" }, { status: 400 });
    }
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
    }

    const command = safeCommandForHost(hostId, action);
    if (command.kind === "inspect") {
      const snapshot = await buildFleetSnapshot();
      const host = snapshot.hosts.find((item) => item.id === hostId) || null;
      return NextResponse.json({
        ok: true,
        kind: "snapshot",
        hostId,
        action,
        message: `Refreshed ${host?.name || hostId}.`,
        host,
        snapshot,
      });
    }

    return NextResponse.json({
      ok: true,
      kind: command.kind,
      hostId,
      action,
      message:
        command.kind === "url"
          ? `Open ${hostId} in a new tab.`
          : `Copy the command and run it where you want the session to land.`,
      value: command.value,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
