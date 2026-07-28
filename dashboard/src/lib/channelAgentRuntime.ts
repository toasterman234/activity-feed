import { mkdir } from "fs/promises";
import { realpathSync } from "fs";
import os from "os";
import path from "path";

// Runtime for channel agents that need REAL tools (research lifecycle).
//
// Two guarantees:
//  1. Tools on — pi runs with its built-in tools plus the `ax-research`
//     ben-agents3 toolset (exa search + get_contents, web/memory research),
//     loaded via the BEN_AGENTS3_TOOLSET env the registry MCP server reads.
//  2. Write-sandbox — pi has NO native path sandbox, so we wrap the whole
//     invocation in macOS `sandbox-exec`. Reads are unrestricted (so the agent
//     can reference any repo/vault); writes are confined to the per-thread
//     workspace plus the temp + tool-cache dirs pi/npx/MCP servers need to run.
//     Everything else (Ben's projects, vault, home docs) is hard-denied by the OS.

const HOME = os.homedir();

/** Root under which each thread gets its own writable workspace. Outside any
 *  repo so agent scratch files never pollute git. */
export function channelWorkspaceRoot(): string {
  return process.env.CHANNEL_WORKSPACE_ROOT || path.join(HOME, ".channel-workspaces");
}

/** Per-thread workspace dir. Created if missing. */
export async function ensureThreadWorkspace(threadId: string): Promise<string> {
  const dir = path.join(channelWorkspaceRoot(), threadId.replace(/[^a-zA-Z0-9._-]/g, "_"));
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Build the macOS sandbox-exec SBPL profile: deny all writes, then re-allow
 *  the thread workspace + the minimum infra dirs pi and its MCP subprocesses
 *  need. Last-matching-rule-wins, so the allow list overrides the blanket deny. */
export function buildWriteSandboxProfile(threadDir: string): string {
  const w = (p: string) => `  (subpath "${p}")`;
  // pi's config/state dirs are symlinked to a governed location on Ben's box
  // (~/.pi/agent -> ~/pi/agent-config/.pi-live/agent). The sandbox sees the
  // resolved real path, so we must allow BOTH the symlink dir and its target,
  // or pi can't write its own locks/caches and every turn dies with EPERM.
  const writable = new Set<string>([
    threadDir,
    "/tmp",
    "/private/tmp",
    "/private/var/folders", // macOS per-user TMPDIR
    path.join(HOME, ".npm"), // npx-spawned MCP servers
    path.join(HOME, ".cache"),
    path.join(HOME, ".config"),
    path.join(HOME, "Library/Caches"),
    path.join(HOME, ".pi"), // pi state/logs
  ]);
  // Add the resolved real path for the pi dir (and thread dir) if symlinked.
  for (const p of [path.join(HOME, ".pi"), threadDir]) {
    try { writable.add(realpathSync(p)); } catch { /* not present yet — skip */ }
  }
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    "(allow file-write*",
    ...[...writable].map(w),
    '  (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr")',
    '  (regex #"^/dev/tty"))',
  ].join("\n");
}

export interface PiInvocation {
  bin: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

/**
 * Build the sandboxed, tool-enabled pi invocation for a research-lifecycle
 * agent turn. cwd is the per-thread workspace; writes are OS-confined to it.
 */
/** Path to the mcp.json that points pi at the out-of-sandbox research registry
 *  (HTTP, ax-research toolset incl. exa). `--mcp-config` replaces the global
 *  stdio config, so the sandboxed pi only talks to this one HTTP endpoint —
 *  no stdio MCP subprocesses to die inside the sandbox. */
export function researchMcpConfigPath(): string {
  return (
    process.env.CHANNEL_RESEARCH_MCP_CONFIG ||
    path.join(HOME, ".config", "channel-research", "mcp.json")
  );
}

export function buildResearchInvocation(params: {
  threadDir: string;
  piBin: string;
  provider: string;
  model: string;
  systemPrompt: string;
  prompt: string;
}): PiInvocation {
  const { threadDir, piBin, provider, model, systemPrompt, prompt } = params;
  const profile = buildWriteSandboxProfile(threadDir);

  // Tools ON: no --no-tools. Real research tools come from the HTTP registry via
  // --mcp-config (exa + ax-research toolset). Thinking stays off so the final
  // message is a clean JSON object (the structured-reply contract).
  const piArgs = [
    "-p",
    "--mode", "text",
    "--no-session",
    "--thinking", "off",
    "--mcp-config", researchMcpConfigPath(),
    "--provider", provider,
    "--model", model,
    "--system-prompt", systemPrompt,
    prompt,
  ];

  return {
    bin: "sandbox-exec",
    args: ["-p", profile, piBin, ...piArgs],
    env: { ...process.env },
    cwd: threadDir,
  };
}
