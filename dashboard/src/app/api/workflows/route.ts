import { NextRequest, NextResponse } from "next/server";
import type { Lifecycle } from "@/app/channels/lifecycles";
import {
  listWorkflowTemplates,
  publishWorkflowTemplate,
} from "@/app/channels/workflowRegistry.server";
import { pool } from "../_db";

export const dynamic = "force-dynamic";

export async function GET() {
  const templates = await listWorkflowTemplates(pool);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const templateId = String(body.templateId || "").trim();
  const definition = body.definition as Lifecycle | undefined;
  if (!templateId || !definition) {
    return NextResponse.json({ error: "templateId and definition required" }, { status: 400 });
  }
  try {
    const template = await publishWorkflowTemplate(pool, templateId, definition);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
