import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { resolveCapabilities, type RegistrySnapshot } from "@/lib/registry";
import { getAgentEvidence } from "@/lib/agent-evidence";

export const dynamic = "force-dynamic";

async function snapshot(): Promise<RegistrySnapshot> {
  const path = join(process.cwd(), "data", "registry.snapshot.json");
  return JSON.parse(await readFile(path, "utf8")) as RegistrySnapshot;
}

export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get("agentEvidence")?.trim();
    if (agentId) {
      const evidence = await getAgentEvidence(agentId);
      return evidence
        ? NextResponse.json(evidence, { headers: { "Cache-Control": "no-store" } })
        : NextResponse.json({ error: "Evidence is only available for primary agent systems." }, { status: 404 });
    }
    const data = await snapshot();
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    const kind = request.nextUrl.searchParams.get("kind")?.trim() || "";
    const records = kind ? data.records.filter((record) => record.kind === kind) : data.records;
    return NextResponse.json(
      {
        ...data,
        records,
        paths: query ? resolveCapabilities(data.records, query) : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        apiVersion: "registry.bencharney.dev/v1alpha1",
        generatedAt: new Date().toISOString(),
        records: [],
        paths: [],
        warnings: [error instanceof Error ? error.message : String(error)],
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
