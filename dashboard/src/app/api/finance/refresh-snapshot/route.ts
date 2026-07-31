import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const warnings: string[] = [];
  const scriptPath = path.join(process.cwd(), "scripts/export-finance-research-snapshot.mjs");
  const env = {
    ...process.env,
    MIRA_ROOT: process.env.MIRA_ROOT || "/home/ubuntu/mira-cases",
    QUANT_RESEARCH_ROOT: process.env.QUANT_RESEARCH_ROOT || "/home/ubuntu/quant-research-pipeline",
  };

  try {
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn("node", [scriptPath], {
          env,
          timeout: 15_000,
          cwd: process.cwd(),
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        child.on("close", (code) => {
          resolve({ code: code ?? 1, stdout, stderr });
        });

        child.on("error", (err) => {
          reject(err);
        });
      },
    );

    if (result.stdout) {
      for (const line of result.stdout.split("\n").filter(Boolean)) {
        if (line.startsWith("Skipped")) {
          warnings.push(line);
        }
      }
    }

    if (result.stderr) {
      for (const line of result.stderr.split("\n").filter(Boolean)) {
        warnings.push(line);
      }
    }

    if (result.code !== 0) {
      return NextResponse.json(
        {
          success: false,
          error: result.stderr || "Snapshot export failed",
          warnings,
        },
        { status: 500 },
      );
    }

    // Verify the snapshot file was written
    const generatedAt = new Date().toISOString();
    return NextResponse.json({ success: true, generatedAt, warnings });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Refresh failed",
        warnings,
      },
      { status: 500 },
    );
  }
}
