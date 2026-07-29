import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, copyFileSync, chmodSync } from "fs";
import { homedir } from "os";

const PROXY_ENV_FILE = homedir() + "/.openclaw/service-env/ai.openclaw.ccproxy.env";
const PI_AUTH_FILE = homedir() + "/.pi/agent/auth.json";
const CC_SWAP_SCRIPT = homedir() + "/.openclaw/service-env/cc-swap.sh";
const PI_SWAP_SCRIPT = homedir() + "/.openclaw/service-env/pi-cc-swap.sh";

export async function POST(req: Request) {
  let body: { key?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, target = "proxy" } = body;

  if (!key || typeof key !== "string" || !key.startsWith("user_")) {
    return NextResponse.json(
      { ok: false, error: "Key must start with user_" },
      { status: 400 }
    );
  }

  const suffix = "…" + key.slice(-6);

  if (target === "proxy") {
    // Swap proxy key
    try {
      if (!readFileSync(PROXY_ENV_FILE, "utf-8").includes("CC_API_KEY")) {
        return NextResponse.json(
          { ok: false, error: "Proxy env file not found" },
          { status: 500 }
        );
      }

      // Backup
      copyFileSync(PROXY_ENV_FILE, PROXY_ENV_FILE + ".bak");

      // Replace the key line
      const env = readFileSync(PROXY_ENV_FILE, "utf-8");
      const updated = env.replace(
        /^export CC_API_KEY=.*$/m,
        `export CC_API_KEY='${key}'`
      );
      writeFileSync(PROXY_ENV_FILE, updated);
      chmodSync(PROXY_ENV_FILE, 0o600);

      // Restart the service
      try {
        const uid = execSync("id -u", { encoding: "utf-8" }).trim();
        execSync(
          `launchctl kickstart -k "gui/${uid}/ai.openclaw.ccproxy"`,
          { timeout: 5000 }
        );
      } catch (e) {
        // kickstart may fail if service isn't loaded; that's ok — the env file
        // is updated and next start will pick it up
      }

      return NextResponse.json({ ok: true, target: "proxy", suffix });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: String(e) },
        { status: 500 }
      );
    }
  }

  if (target === "all" || target === "pi") {
    // Delegate to cc-swap-all.sh which updates local consumers and fans out over SSH
    // (OVH ↔ Mac Mini). "pi" uses the same fleet script so paseo/pi stays in sync
    // on every machine; script is idempotent when already current.
    try {
      const out = execSync(
        `"${homedir()}/.openclaw/service-env/cc-swap-all.sh" "${key}"`,
        { timeout: 90000, encoding: "utf-8" }
      );
      return NextResponse.json({
        ok: true,
        target,
        suffix,
        log: String(out || "").trim().split("\n").slice(-12),
      });
    } catch (e: any) {
      const detail = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n");
      return NextResponse.json(
        { ok: false, error: detail || String(e) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: `Unknown target "${target}". Use "proxy", "pi", or "all".` },
    { status: 400 }
  );
}
