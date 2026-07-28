import { execSync } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
import { DatabaseSync } from "node:sqlite";

const PROVIDER_LABELS = {
  "openai-codex": "Codex",
  anthropic: "Claude Code",
  "kimi-code": "Kimi Code",
  "github-copilot": "GitHub Copilot",
  "google-antigravity": "Google Antigravity",
  "opencode-go": "OpenCode Go",
  "command-code": "Command Code",
  openclaw: "OpenClaw",
  "grok-build": "Grok Build",
  cursor: "Cursor",
  pi: "Pi",
};

const TOKSCALE_PROVIDER_IDS = {
  Codex: "openai-codex",
  Copilot: "github-copilot",
  "Claude Code": "anthropic",
  "Kimi Code": "kimi-code",
  "Google Antigravity": "google-antigravity",
  "OpenCode Go": "opencode-go",
  "Command Code": "command-code",
  OpenClaw: "openclaw",
  "Grok Build": "grok-build",
  Cursor: "cursor",
  Pi: "pi",
};

const OMP_BIN = process.env.OMP_BIN || join(homedir(), ".bun/bin/omp");
export const SUBSCRIPTIONS_SNAPSHOT_PATH = process.env.SUBSCRIPTIONS_SNAPSHOT_PATH || join(process.cwd(), "data", "subscriptions.snapshot.json");

function providerLabel(id) {
  return PROVIDER_LABELS[id] || id;
}

function hasProviderAccount(accountsByKey, providerId) {
  return [...accountsByKey.keys()].some((entry) => entry.startsWith(`${providerId}::`));
}

function percentStatus(usedFrac) {
  return usedFrac >= 0.95 ? "exhausted" : usedFrac >= 0.8 ? "warning" : "ok";
}

function ingestTokscale(output, accountsByKey) {
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    return;
  }
  if (!Array.isArray(data)) return;

  for (const entry of data) {
    const provider = (entry.provider || "").trim();
    const email = (entry.email || "").trim() || null;
    const plan = (entry.plan || "").trim() || null;
    const resetCredits = entry.reset_credits?.available_count ?? 0;

    const providerId = TOKSCALE_PROVIDER_IDS[provider] || provider.toLowerCase().replace(/\s+/g, "-");

    const accountId = email || plan || provider;
    if (accountId === "usage-only") continue;

    const metrics = entry.metrics || [];
    const limits = metrics.map((metric) => {
      const usedPct = metric.used_percent ?? 0;
      const remainingPct = metric.remaining_percent ?? 100;
      return {
        label: metric.label || "Usage",
        window: null,
        used: null,
        limit: null,
        remaining: null,
        used_frac: usedPct / 100,
        remaining_frac: remainingPct / 100,
        unit: "percent",
        status: percentStatus(usedPct / 100),
        resets_at: metric.resets_at || null,
        duration_hours: null,
      };
    });

    accountsByKey.set(`${providerId}::${accountId}`, {
      provider: providerId,
      provider_label: providerLabel(providerId),
      account_id: accountId,
      email,
      plan,
      source: "tokscale",
      limits,
      reset_credits: resetCredits,
    });
  }
}

function ingestOmp(output, accountsByKey) {
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    return;
  }

  const reports = data?.reports || [];
  for (const report of reports) {
    const providerId = report.provider;
    const limitsRaw = report.limits || [];
    const seenAccounts = new Set();
    const tier = limitsRaw[0]?.scope?.tier || null;
    const hasTokscaleForProvider = hasProviderAccount(accountsByKey, providerId);

    for (const limit of limitsRaw) {
      const scope = limit.scope || {};
      const accountId = scope.accountId || "primary";
      if (seenAccounts.has(accountId)) continue;
      seenAccounts.add(accountId);

      const accountLimits = limitsRaw.filter((entry) => (entry.scope?.accountId || "primary") === accountId);
      const parsed = accountLimits.map((entry) => {
        const window = entry.window || {};
        const used = window.used ?? entry.usage?.used ?? null;
        const max = window.limit ?? entry.usage?.limit ?? null;
        const remaining = window.remaining ?? entry.usage?.remaining ?? null;
        const usedFrac =
          window.used_frac
          ?? entry.usage?.used_frac
          ?? (max != null && used != null && max > 0 ? used / max : 0);
        const unit = window.unit ?? entry.usage?.unit ?? null;
        const normalizedUsedFrac = typeof usedFrac === "number" ? usedFrac : 0;

        return {
          label: entry.label || "Usage",
          window: window.id || null,
          used,
          limit: max,
          remaining,
          used_frac: normalizedUsedFrac,
          remaining_frac: 1 - normalizedUsedFrac,
          unit: unit || null,
          status: unit === "percent" ? percentStatus(normalizedUsedFrac) : "ok",
          resets_at: window.resets_at || null,
          duration_hours: window.duration_hours || null,
        };
      });

      const key = `${providerId}::${accountId}`;
      if (!accountsByKey.has(key) && !hasTokscaleForProvider) {
        accountsByKey.set(key, {
          provider: providerId,
          provider_label: providerLabel(providerId),
          account_id: accountId,
          email: null,
          plan: tier,
          source: "omp",
          limits: parsed,
          reset_credits: 0,
        });
      }
    }
  }
}

function msEpochToIso(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

function pctLimit(label, usedPct, resetsAt) {
  const pct = Math.max(0, Math.min(100, Number(usedPct) || 0));
  return {
    label,
    window: null,
    used: null,
    limit: null,
    remaining: null,
    used_frac: pct / 100,
    remaining_frac: 1 - pct / 100,
    unit: "percent",
    status: percentStatus(pct / 100),
    resets_at: resetsAt,
    duration_hours: null,
  };
}

async function ingestCursorLocal(accountsByKey, errors) {
  if (hasProviderAccount(accountsByKey, "cursor")) return;

  const dbPath = join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb");

  let token = "";
  let email = null;
  let planLocal = null;
  let statusLocal = null;

  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const get = (key) => {
        const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key);
        return (row?.value || "").trim();
      };
      token = get("cursorAuth/accessToken");
      email = get("cursorAuth/cachedEmail") || null;
      planLocal = get("cursorAuth/stripeMembershipType") || null;
      statusLocal = get("cursorAuth/stripeSubscriptionStatus") || null;
    } finally {
      db.close();
    }
  } catch (error) {
    errors.push(`cursor-local: ${String(error?.message || error)}`.slice(0, 200));
    return;
  }

  if (!token) {
    errors.push("cursor-local: no Cursor IDE access token (sign in to Cursor)");
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "activity-feed-dashboard/subscriptions",
  };

  async function postJson(path) {
    try {
      const response = await fetch(`https://api2.cursor.sh/${path}`, {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  const [usage, planInfo, me] = await Promise.all([
    postJson("aiserver.v1.DashboardService/GetCurrentPeriodUsage"),
    postJson("aiserver.v1.DashboardService/GetPlanInfo"),
    postJson("aiserver.v1.DashboardService/GetMe"),
  ]);

  if (!usage && !planInfo && !planLocal) {
    errors.push("cursor-local: Cursor usage API unreachable");
    return;
  }

  email = (me?.email || email || "").trim() || null;
  const plan = (planInfo?.planInfo?.planName || planLocal || "Cursor").toString().trim() || "Cursor";
  const accountId = email || plan || "cursor";
  const resetsAt = msEpochToIso(usage?.billingCycleEnd) || msEpochToIso(planInfo?.planInfo?.billingCycleEnd);

  const planUsage = usage?.planUsage || {};
  const limits = [];

  if (typeof planUsage.autoPercentUsed === "number") {
    limits.push(pctLimit("Auto", planUsage.autoPercentUsed, resetsAt));
  }
  if (typeof planUsage.apiPercentUsed === "number") {
    limits.push(pctLimit("API", planUsage.apiPercentUsed, resetsAt));
  }
  if (typeof planUsage.totalPercentUsed === "number") {
    limits.push(pctLimit("Total", planUsage.totalPercentUsed, resetsAt));
  }

  if (!limits.length) {
    const subscriptionActive = (statusLocal || "").toLowerCase() === "active";
    limits.push({
      label: subscriptionActive ? "Subscription" : "Status",
      window: null,
      used: null,
      limit: null,
      remaining: null,
      used_frac: subscriptionActive ? 0 : 1,
      remaining_frac: subscriptionActive ? 1 : 0,
      unit: "percent",
      status: subscriptionActive ? "ok" : "unknown",
      resets_at: resetsAt,
      duration_hours: null,
    });
  }

  accountsByKey.set(`cursor::${accountId}`, {
    provider: "cursor",
    provider_label: providerLabel("cursor"),
    account_id: accountId,
    email,
    plan,
    source: "cursor-local",
    limits,
    reset_credits: 0,
  });
}

function ingestTokscaleModels(output, accountsByKey) {
  let parsed = null;
  try {
    parsed = JSON.parse(output);
  } catch {
    return;
  }

  const entries = parsed?.entries || [];
  if (!entries.length) return;

  const byClient = {};
  for (const entry of entries) {
    const client = entry.client || "?";
    const totals = byClient[client] || { cost: 0, input: 0, output: 0, messages: 0, models: [] };
    totals.cost += entry.cost || 0;
    totals.input += entry.input || 0;
    totals.output += entry.output || 0;
    totals.messages += entry.messageCount || 0;
    totals.models.push(entry);
    byClient[client] = totals;
  }

  const clientMap = {
    claude: "anthropic",
    codex: "openai-codex",
    copilot: "github-copilot",
    pi: "pi",
    opencode: "opencode-go",
    commandcode: "command-code",
    gemini: "google-antigravity",
    grok: "grok-build",
    kimi: "kimi-code",
    openclaw: "openclaw",
    cursor: "cursor",
  };

  for (const [client, totals] of Object.entries(byClient)) {
    if (totals.cost < 0.001) continue;
    const providerId = clientMap[client] || client;
    if (hasProviderAccount(accountsByKey, providerId)) continue;

    totals.models.sort((a, b) => (b.cost || 0) - (a.cost || 0));
    const limits = [];
    const top = totals.models[0];
    if (top) {
      limits.push({
        label: top.model || "?",
        used: Math.round((top.cost || 0) * 10_000) / 10_000,
        used_frac: 0,
        remaining_frac: 1,
        unit: "usd",
        status: "ok",
      });
    }
    limits.push({
      label: `${(totals.input + totals.output).toLocaleString()} tokens · ${totals.messages.toLocaleString()} msgs`,
      used: Math.round(totals.cost * 10_000) / 10_000,
      used_frac: 0,
      remaining_frac: 1,
      unit: "usd",
      status: "ok",
    });

    accountsByKey.set(`${providerId}::${client}`, {
      provider: providerId,
      provider_label: providerLabel(providerId),
      account_id: client,
      email: null,
      plan: "usage-only",
      source: "tokscale-models",
      limits,
      reset_credits: 0,
    });
  }
}

export async function collectSubscriptionsLive() {
  const errors = [];
  const accountsByKey = new Map();

  try {
    const output = execSync("npx tokscale usage --json", {
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    if (output.trim()) ingestTokscale(output, accountsByKey);
  } catch (error) {
    errors.push(`tokscale: ${error.stderr || error.message || String(error)}`.slice(0, 200));
  }

  try {
    const output = execSync(`${OMP_BIN} usage --json`, {
      encoding: "utf-8",
      timeout: 20_000,
    });
    if (output.trim()) ingestOmp(output, accountsByKey);
  } catch (error) {
    errors.push(`omp: ${error.stderr || error.message || String(error)}`.slice(0, 200));
  }

  try {
    const output = execSync("npx tokscale models --json", {
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    if (output.trim()) ingestTokscaleModels(output, accountsByKey);
  } catch {
    // optional
  }

  try {
    await ingestCursorLocal(accountsByKey, errors);
  } catch (error) {
    errors.push(`cursor-local: ${error?.message || String(error)}`.slice(0, 200));
  }

  return {
    reachable: accountsByKey.size > 0,
    errors,
    accounts: [...accountsByKey.values()],
    generated_at: new Date().toISOString(),
  };
}

export function hasUsableSubscriptions(result) {
  return Boolean(result && Array.isArray(result.accounts) && result.accounts.length > 0);
}

export async function readSubscriptionsSnapshot() {
  try {
    const raw = await readFile(SUBSCRIPTIONS_SNAPSHOT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeSubscriptionsSnapshot(result) {
  await mkdir(dirname(SUBSCRIPTIONS_SNAPSHOT_PATH), { recursive: true });
  await writeFile(SUBSCRIPTIONS_SNAPSHOT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  return SUBSCRIPTIONS_SNAPSHOT_PATH;
}
