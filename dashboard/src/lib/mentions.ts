/** Extract @handles from message text. Handles: letters, digits, ._:- */
export function parseMentions(text: string): string[] {
  const found = new Set<string>();
  const re = /(?:^|[\s([{])@([A-Za-z0-9][A-Za-z0-9._:-]{0,63})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[1]);
  return [...found];
}

export function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export type PaseoAgent = {
  id: string;
  shortId?: string;
  name?: string;
  title?: string;
  provider?: string;
  status?: string;
  cwd?: string;
};

/** Map a free-text @handle to a Paseo provider string (legacy / display). */
export function providerForHandle(handle: string): string {
  const h = handle.toLowerCase();
  if (h === "pi" || h.startsWith("pi/") || h.includes("deepseek")) {
    return "pi/commandcode/deepseek/deepseek-v4-pro";
  }
  if (h === "claude" || h === "claude-code" || h.startsWith("claude/") || h.includes("sonnet") || h.includes("opus")) {
    return "claude/claude-sonnet-5";
  }
  if (h === "codex" || h.startsWith("codex/") || h.includes("gpt-5")) {
    return "codex/gpt-5.4";
  }
  if (h === "cursor" || h.includes("grok")) {
    return "cursor/grok-4.5";
  }
  // Default from user orchestration prefs: Pi
  return "pi/commandcode/deepseek/deepseek-v4-pro";
}

/** Map @handle → pi CLI --provider / --model (channel replies bypass Paseo). */
export function piInvocationForHandle(handle: string): { provider: string; model: string } {
  const h = handle.toLowerCase();
  if (h === "claude" || h === "claude-code" || h.startsWith("claude/") || h.includes("sonnet") || h.includes("opus")) {
    return { provider: "commandcode", model: "claude-sonnet-5" };
  }
  if (h === "codex" || h.startsWith("codex/") || h.includes("gpt-5")) {
    return { provider: "commandcode", model: "gpt-5.4" };
  }
  if (h === "cursor" || h.includes("grok")) {
    return { provider: "commandcode", model: "xai/grok-4.5" };
  }
  // @pi and default
  return { provider: "commandcode", model: "deepseek/deepseek-v4-pro" };
}

export function matchPaseoAgent(handle: string, agents: PaseoAgent[]): PaseoAgent | null {
  const h = handle.toLowerCase();
  for (const a of agents) {
    if (a.id?.toLowerCase() === h) return a;
    if (a.shortId?.toLowerCase() === h) return a;
    if (a.id?.toLowerCase().startsWith(h) && h.length >= 6) return a;
    const name = (a.name || a.title || "").toLowerCase();
    if (name && (name === h || slugifyAgentName(name) === h)) return a;
  }
  return null;
}

export function renderBodyWithMentions(body: string): { type: "text" | "mention"; value: string }[] {
  const parts: { type: "text" | "mention"; value: string }[] = [];
  const re = /@([A-Za-z0-9][A-Za-z0-9._:-]{0,63})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push({ type: "text", value: body.slice(last, m.index) });
    parts.push({ type: "mention", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return parts.length ? parts : [{ type: "text", value: body }];
}
