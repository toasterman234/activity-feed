import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const PROXY_ENV_FILE = process.env.HOME + "/.openclaw/service-env/ai.openclaw.ccproxy.env";
const PI_AUTH_FILE = process.env.HOME + "/.pi/agent/auth.json";
const PROXY_URL = "http://127.0.0.1:8787/v1/models";

export async function GET() {
  const result: {
    proxy: { running: boolean; keySuffix: string; error?: string };
    pi: { keySuffix: string };
    iii: { keySuffix: string; error?: string };
    models: string[];
    lastSwap: string | null;
  } = {
    proxy: { running: false, keySuffix: "" },
    pi: { keySuffix: "" },
    iii: { keySuffix: "" },
    models: [],
    lastSwap: null,
  };

  // Proxy key suffix
  try {
    const env = readFileSync(PROXY_ENV_FILE, "utf-8");
    const m = env.match(/CC_API_KEY='user_(.+?)'/);
    if (m) result.proxy.keySuffix = "…" + m[1].slice(-6);
  } catch {
    result.proxy.error = "env file not found";
  }

  // Pi key suffix
  try {
    const auth = JSON.parse(readFileSync(PI_AUTH_FILE, "utf-8"));
    const access = auth?.commandcode?.access;
    if (typeof access === "string" && access.startsWith("user_")) {
      result.pi.keySuffix = "…" + access.slice(-6);
    }
  } catch {
    /* auth.json may not exist */
  }


  // iii harness CommandCode key (llm-router providers.commandcode)
  try {
    const out = execSync(
      `${process.env.HOME}/.local/bin/iii trigger configuration::get --json '{"id":"llm-router","raw":true}' --timeout-ms 8000`,
      { encoding: "utf-8", timeout: 12000, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin` } }
    );
    const parsed = JSON.parse(out);
    const value = parsed?.value ?? parsed;
    const key = value?.providers?.commandcode?.api_key;
    if (typeof key === "string" && key.startsWith("user_")) {
      result.iii.keySuffix = "…" + key.slice(-6);
    }
  } catch (e) {
    result.iii.error = "unreachable";
  }

  // Check proxy health and list models
  try {
    const resp = await fetch(PROXY_URL, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const body = await resp.json();
      result.proxy.running = true;
      result.models = (body.data ?? []).map((m: { id: string }) => m.id).sort();
    }
  } catch {
    /* proxy down */
  }

  // Check launchctl status
  try {
    const out = execSync("launchctl list | grep ccproxy", { encoding: "utf-8", timeout: 2000 }).trim();
    if (out && !result.proxy.running) {
      result.proxy.running = true; // process exists but API not responding yet
    }
  } catch {
    /* not in launchctl */
  }

  // Last swap time from backup file
  try {
    let stat = "";
    try {
      stat = execSync(`stat -f "%Sm" "${PROXY_ENV_FILE}.bak" 2>/dev/null`, { encoding: "utf-8", timeout: 1000 }).trim();
    } catch {
      stat = execSync(`stat -c "%y" "${PROXY_ENV_FILE}.bak" 2>/dev/null`, { encoding: "utf-8", timeout: 1000 }).trim();
    }
    if (stat) result.lastSwap = stat;
  } catch {
    /* no backup */
  }

  return NextResponse.json(result);
}
