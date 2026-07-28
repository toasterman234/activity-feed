import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileNoStdin } from "./execFileNoStdin.ts";

export type RunWorkspace = {
  cwd: string;
  branch: string;
  baseCommit: string;
};

export function workRunBranch(runId: string): string {
  const slug = runId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  if (!slug) throw new Error("runId must contain letters or numbers");
  return `codex/work-run-${slug}`;
}

function worktreeRoot(): string {
  return (
    process.env.CHANNEL_WORKTREE_ROOT ||
    path.join(os.homedir(), ".activity-dashboard", "worktrees")
  );
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function prepareRunWorktree(input: {
  repoPath: string;
  runId: string;
}): Promise<RunWorkspace> {
  const repoPath = path.resolve(input.repoPath);
  const inside = await execFileNoStdin("git", ["-C", repoPath, "rev-parse", "--show-toplevel"], {
    timeout: 15_000,
  });
  const repoRoot = inside.stdout.trim();
  if (path.resolve(repoRoot) !== repoPath) {
    throw new Error(`registered repository path is not its git root: ${repoPath}`);
  }

  const base = await execFileNoStdin("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    timeout: 15_000,
  });
  const baseCommit = base.stdout.trim();
  const branch = workRunBranch(input.runId);
  const root = worktreeRoot();
  const cwd = path.join(root, input.runId);
  await mkdir(root, { recursive: true });

  if (await isDirectory(cwd)) {
    const existing = await execFileNoStdin("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      timeout: 15_000,
    });
    if (existing.stdout.trim() !== branch) {
      throw new Error(`worktree already exists on unexpected branch: ${cwd}`);
    }
    return { cwd, branch, baseCommit };
  }

  await execFileNoStdin(
    "git",
    ["-C", repoRoot, "worktree", "add", "-b", branch, cwd, baseCommit],
    { timeout: 60_000, maxBuffer: 1024 * 1024 },
  );
  return { cwd, branch, baseCommit };
}
