import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { execFileNoStdin } from "./execFileNoStdin.ts";

type Queryable = Pick<Pool | PoolClient, "query">;

export type VerificationCommand = {
  key: string;
  label: string;
  command: string;
  required: boolean;
};

export type VerificationProfile = {
  repo_id: string;
  repo_path: string;
  working_directory: string | null;
  commands: VerificationCommand[];
  timeout_ms: number;
  max_feedback_cycles: number;
  enabled: boolean;
};

export type VerificationResult = {
  configured: boolean;
  passed: boolean;
  summary: string;
  failedChecks: Array<{ key: string; label: string; output: string }>;
  feedbackCycle: number | null;
};

export function normalizeVerificationCommands(value: unknown): VerificationCommand[] {
  if (!Array.isArray(value)) throw new Error("commands must be an array");
  const keys = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`command ${index + 1} must be an object`);
    const row = item as Record<string, unknown>;
    const key = String(row.key || "").trim();
    const label = String(row.label || "").trim();
    const command = String(row.command || "").trim();
    if (!key || !/^[a-z0-9][a-z0-9._-]*$/i.test(key)) {
      throw new Error(`command ${index + 1} has an invalid key`);
    }
    if (keys.has(key)) throw new Error(`duplicate command key: ${key}`);
    if (!label || !command) throw new Error(`command ${key} requires label and command`);
    keys.add(key);
    return { key, label, command, required: row.required !== false };
  });
}

export async function getThreadVerificationProfile(
  db: Queryable,
  threadId: string,
): Promise<VerificationProfile | null> {
  const result = await db.query<VerificationProfile>(
    `SELECT p.repo_id, r.path AS repo_path, p.working_directory, p.commands,
            p.timeout_ms, p.max_feedback_cycles, p.enabled
       FROM thread_meta tm
       JOIN repos r ON r.id = tm.repo_id
       JOIN repo_verification_profiles p ON p.repo_id = r.id
      WHERE tm.thread_id = $1`,
    [threadId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, commands: normalizeVerificationCommands(row.commands) };
}

export async function upsertVerificationProfile(
  db: Queryable,
  input: {
    repoId: string;
    workingDirectory?: string | null;
    commands: unknown;
    timeoutMs?: number;
    maxFeedbackCycles?: number;
    enabled?: boolean;
  },
): Promise<VerificationProfile> {
  const commands = normalizeVerificationCommands(input.commands);
  const timeoutMs = Math.max(1_000, Math.min(900_000, Math.floor(input.timeoutMs || 120_000)));
  const maxFeedbackCycles = Math.max(0, Math.min(10, Math.floor(input.maxFeedbackCycles ?? 2)));
  await db.query(
    `INSERT INTO repo_verification_profiles (
       repo_id, working_directory, commands, timeout_ms, max_feedback_cycles, enabled
     )
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (repo_id) DO UPDATE
       SET working_directory = EXCLUDED.working_directory,
           commands = EXCLUDED.commands,
           timeout_ms = EXCLUDED.timeout_ms,
           max_feedback_cycles = EXCLUDED.max_feedback_cycles,
           enabled = EXCLUDED.enabled,
           updated_at = now()`,
    [
      input.repoId,
      input.workingDirectory?.trim() || null,
      JSON.stringify(commands),
      timeoutMs,
      maxFeedbackCycles,
      input.enabled !== false,
    ],
  );
  const result = await db.query<VerificationProfile>(
    `SELECT p.repo_id, r.path AS repo_path, p.working_directory, p.commands,
            p.timeout_ms, p.max_feedback_cycles, p.enabled
       FROM repo_verification_profiles p
       JOIN repos r ON r.id = p.repo_id
      WHERE p.repo_id = $1`,
    [input.repoId],
  );
  const profile = result.rows[0];
  if (!profile) throw new Error("verification profile was not saved");
  return { ...profile, commands };
}

function resolveVerificationCwd(profile: VerificationProfile): string {
  const root = path.resolve(profile.repo_path);
  const cwd = path.resolve(root, profile.working_directory || ".");
  if (cwd !== root && !cwd.startsWith(`${root}${path.sep}`)) {
    throw new Error("verification working directory must stay inside the repository");
  }
  if (!existsSync(cwd)) throw new Error(`verification working directory not found: ${cwd}`);
  return cwd;
}

export async function runThreadVerification(
  db: Queryable,
  input: { threadId: string; runId: string },
): Promise<VerificationResult> {
  const profile = await getThreadVerificationProfile(db, input.threadId);
  if (!profile) {
    return {
      configured: false,
      passed: false,
      summary: "No repository verification profile is configured.",
      failedChecks: [],
      feedbackCycle: null,
    };
  }
  if (!profile.enabled) {
    return {
      configured: true,
      passed: true,
      summary: "Repository verification is disabled.",
      failedChecks: [],
      feedbackCycle: null,
    };
  }
  if (!profile.commands.length) {
    return {
      configured: true,
      passed: false,
      summary: "The repository verification profile has no checks.",
      failedChecks: [],
      feedbackCycle: null,
    };
  }

  const cwd = resolveVerificationCwd(profile);
  const failedChecks: VerificationResult["failedChecks"] = [];
  for (const check of profile.commands) {
    const existing = await db.query<{ status: string; output_excerpt: string | null }>(
      `SELECT status, output_excerpt FROM work_run_checks WHERE run_id = $1 AND check_key = $2`,
      [input.runId, check.key],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].status === "failed" && check.required) {
        failedChecks.push({
          key: check.key,
          label: check.label,
          output: existing.rows[0].output_excerpt || "Check failed",
        });
      }
      continue;
    }

    const checkId = randomUUID();
    await db.query(
      `INSERT INTO work_run_checks (
         id, run_id, thread_id, repo_id, check_key, label, command, required, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'running')`,
      [checkId, input.runId, input.threadId, profile.repo_id, check.key, check.label, check.command, check.required],
    );

    try {
      const output = await execFileNoStdin("/bin/bash", ["-lc", check.command], {
        cwd,
        env: { ...process.env, CI: "1" },
        timeout: profile.timeout_ms,
        maxBuffer: 2 * 1024 * 1024,
      });
      const excerpt = `${output.stdout}\n${output.stderr}`.trim().slice(-4000);
      await db.query(
        `UPDATE work_run_checks
            SET status = 'passed', exit_code = 0, output_excerpt = $2,
                completed_at = now()
          WHERE id = $1`,
        [checkId, excerpt],
      );
    } catch (error) {
      const commandError = error as Error & { stdout?: string; stderr?: string; code?: number | null };
      const excerpt = [commandError.message, commandError.stdout, commandError.stderr]
        .filter(Boolean)
        .join("\n")
        .slice(-4000);
      await db.query(
        `UPDATE work_run_checks
            SET status = 'failed', exit_code = $2, output_excerpt = $3,
                completed_at = now()
          WHERE id = $1`,
        [checkId, commandError.code ?? null, excerpt],
      );
      if (check.required) failedChecks.push({ key: check.key, label: check.label, output: excerpt });
    }
  }

  if (!failedChecks.length) {
    return {
      configured: true,
      passed: true,
      summary: `${profile.commands.length} verification check${profile.commands.length === 1 ? "" : "s"} passed.`,
      failedChecks: [],
      feedbackCycle: null,
    };
  }

  const cycleResult = await db.query<{ cycle: number }>(
    `SELECT COALESCE(MAX(cycle), 0)::int + 1 AS cycle
       FROM issue_feedback_cycles
      WHERE thread_id = $1`,
    [input.threadId],
  );
  const cycle = Number(cycleResult.rows[0]?.cycle || 1);
  const summary = failedChecks.map((check) => `${check.label}: ${check.output.slice(-800)}`).join("\n\n");
  await db.query(
    `INSERT INTO issue_feedback_cycles (id, thread_id, run_id, cycle, verdict, summary, payload)
     VALUES ($1, $2, $3, $4, 'action_required', $5, $6::jsonb)
     ON CONFLICT (run_id, cycle) DO NOTHING`,
    [
      randomUUID(),
      input.threadId,
      input.runId,
      cycle,
      summary.slice(0, 8000),
      JSON.stringify({ failedChecks: failedChecks.map(({ key, label }) => ({ key, label })) }),
    ],
  );
  return {
    configured: true,
    passed: false,
    summary: `Verification failed on ${failedChecks.length} required check${failedChecks.length === 1 ? "" : "s"}.`,
    failedChecks,
    feedbackCycle: cycle,
  };
}
