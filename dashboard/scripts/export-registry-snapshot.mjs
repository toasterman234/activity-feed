#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const home = homedir();
const output = new URL("../data/registry.snapshot.json", import.meta.url);
const generatedAt = new Date().toISOString();
const records = [];
const warnings = [];

function record(kind, id, name, source, extra = {}) {
  records.push({
    apiVersion: "registry.bencharney.dev/v1alpha1",
    kind,
    metadata: {
      id: `${kind.toLowerCase()}:${id}`,
      name,
      status: extra.status || "active",
      description: extra.description || "",
      version: extra.version,
      owner: "ben",
      tags: extra.tags || [],
      source: { adapter: extra.adapter || "filesystem", locator: source, observedAt: generatedAt },
    },
    spec: {
      capabilities: extra.capabilities || [],
      relations: extra.relations || [],
      config: extra.config || {},
    },
    observed: { status: extra.observed || extra.status || "active", observedAt: generatedAt },
  });
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  for (const line of (match?.[1] || "").split("\n")) {
    const part = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (part) out[part[1]] = part[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function scanSkills(root, adapter) {
  try {
    for (const entry of readdirSync(root)) {
      const path = join(root, entry, "SKILL.md");
      try {
        if (!statSync(path).isFile()) continue;
        const meta = frontmatter(readFileSync(path, "utf8"));
        const id = entry.toLowerCase();
        const existing = records.find((row) => row.metadata.id === `skill:${id}`);
        if (existing) {
          existing.metadata.tags = [...new Set([...(existing.metadata.tags || []), adapter])];
          existing.spec.config = {
            ...existing.spec.config,
            additionalSources: [
              ...((existing.spec.config?.additionalSources) || []),
              path.replace(home, "~"),
            ],
          };
          continue;
        }
        record("Skill", id, meta.name || entry, path.replace(home, "~"), {
          adapter,
          description: meta.description || "",
          capabilities: [`skill.${id.replaceAll("-", ".")}`],
          tags: [adapter],
        });
      } catch {}
    }
  } catch {
    warnings.push(`Skill source unavailable: ${root.replace(home, "~")}`);
  }
}

function loadAgentToolsetPolicies(path) {
  const policies = {};
  try {
    let inAgents = false;
    let current = null;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (line === "agents:") {
        inAgents = true;
        continue;
      }
      if (inAgents && /^[a-zA-Z_]/.test(line)) break;
      const agent = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
      if (agent) current = agent[1];
      const toolset = line.match(/^    toolset:\s*([a-zA-Z0-9_-]+)/);
      if (current && toolset) policies[current] = toolset[1];
    }
  } catch {
    warnings.push(`Agent toolset policy unavailable: ${path.replace(home, "~")}`);
  }
  return policies;
}

function scanYamlDir(root, kind, adapter) {
  try {
    for (const entry of readdirSync(root).filter((name) => name.endsWith(".yaml"))) {
      const id = entry.replace(/\.yaml$/, "");
      const text = readFileSync(join(root, entry), "utf8");
      const servers = [...text.matchAll(/^\s*-\s*server:\s*([a-zA-Z0-9_-]+)/gm)].map((match) => match[1]);
      record(kind, id, id.replaceAll("-", " "), join(root, entry).replace(home, "~"), {
        adapter,
        capabilities: [`${kind.toLowerCase()}.${id.replaceAll("-", ".")}`],
        relations: servers.map((server) => ({ type: "contains", target: `tool:${server}` })),
      });
    }
  } catch {
    warnings.push(`${kind} source unavailable: ${root.replace(home, "~")}`);
  }
}

scanSkills(join(home, ".codex", "skills"), "codex-skill");
scanSkills(join(home, ".agents", "skills"), "shared-skill");
scanSkills(join(home, ".claude", "skills"), "claude-skill");

const registryRoot = join(home, "ben-workspace", "projects", "control-plane", "ben-agents3-tool-registry", "config");
scanYamlDir(join(registryRoot, "servers"), "Tool", "mcp-registry");
scanYamlDir(join(registryRoot, "toolsets"), "Toolset", "mcp-registry");
const toolsetPolicies = loadAgentToolsetPolicies(join(registryRoot, "policies", "agents.yaml"));

const routingPath = join(home, "central-ops-dashboard", "routing-index.json");
try {
  const routing = JSON.parse(readFileSync(routingPath, "utf8"));
  for (const agent of routing.agents || []) {
    const source = String(agent.source || routingPath.replace(home, "~"));
    const expandedSource = source.startsWith("~/") ? join(home, source.slice(2)) : source;
    let agentMeta = {};
    try {
      agentMeta = frontmatter(readFileSync(expandedSource, "utf8"));
    } catch {}
    const relations = agent.runtime ? [{ type: "runs-on", target: `runtime:${agent.runtime}` }] : [];
    const toolset = toolsetPolicies[String(agent.id).toLowerCase()] || toolsetPolicies[agent.runtime] || toolsetPolicies.default;
    if (toolset) relations.push({ type: "uses", target: `toolset:${toolset}` });
    const model = agentMeta.model?.trim();
    if (model) relations.push({ type: "uses", target: `model:claude/${model}` });
    const calledBy = String(agentMeta.description || "").match(/Called BY ([A-Za-z0-9_-]+) skill/i);
    if (calledBy) relations.push({ type: "uses", target: `skill:${calledBy[1].toLowerCase()}` });
    record("Agent", agent.id, agentMeta.name || agent.id, source, {
      adapter: agent.registry || "routing-index",
      status: agent.status || "unknown",
      observed: agent.status || "unknown",
      description: agentMeta.description || "",
      capabilities: agent.capabilities || [],
      tags: [agent.runtime, agent.registry].filter(Boolean),
      relations,
      config: { model: model || null, toolset: toolset || null },
    });
  }
  for (const harness of routing.harnesses || []) {
    record("Runtime", harness.id, harness.id, routingPath.replace(home, "~"), {
      adapter: "routing-index",
      status: harness.status || "unknown",
      description: harness.role || harness.overview || "",
      capabilities: [`runtime.${harness.id}`],
    });
  }
  for (const doctrine of routing.doctrine || []) {
    record("Policy", doctrine.id, doctrine.id.replaceAll("-", " "), doctrine.path || routingPath.replace(home, "~"), {
      adapter: "routing-index",
      description: doctrine.overview || "",
      capabilities: [`policy.${doctrine.id.replaceAll("-", ".")}`],
    });
  }
} catch {
  warnings.push("routing-index.json unavailable");
}

const piModelsPath = join(home, ".pi", "agent", "models.json");
try {
  const providers = JSON.parse(readFileSync(piModelsPath, "utf8")).providers || {};
  for (const [provider, config] of Object.entries(providers)) {
    for (const model of config.models || []) {
      record("Model", `${provider}/${model.id}`, model.name || model.id, piModelsPath.replace(home, "~"), {
        adapter: "pi-models",
        capabilities: [`model.${model.id.replaceAll("-", ".")}`, `provider.${provider.replaceAll("-", ".")}`],
        tags: [provider, model.id],
        config: { provider, modelId: model.id },
      });
    }
  }
} catch {
  warnings.push("Pi model registry unavailable");
}

const piSettingsPath = join(home, ".pi", "agent", "settings.json");
const piMcpPath = join(home, ".pi", "agent", "mcp.json");
let piDefaultModel = null;
let piMcpNames = [];
try {
  piDefaultModel = JSON.parse(readFileSync(piSettingsPath, "utf8")).defaultModel || null;
} catch {
  warnings.push("Pi settings unavailable");
}
try {
  piMcpNames = Object.keys(JSON.parse(readFileSync(piMcpPath, "utf8")).mcpServers || {});
  for (const toolName of piMcpNames) {
    const id = `tool:${toolName.replaceAll("-", "_")}`;
    if (!records.some((row) => row.metadata.id === id)) {
      record("Tool", toolName.replaceAll("-", "_"), toolName, piMcpPath.replace(home, "~"), {
        adapter: "pi-mcp",
        capabilities: [`tool.${toolName.replaceAll("-", ".")}`],
      });
    }
  }
} catch {
  warnings.push("Pi MCP config unavailable");
}

const currentAgents = records.filter((row) => row.kind === "Agent");
record("Agent", "pi", "Pi", piSettingsPath.replace(home, "~"), {
  adapter: "agent-system",
  status: "live",
  observed: "live",
  description: "Primary Pi coding agent, model router, extensions, skills, MCP tools, and configured subagents.",
  capabilities: ["agent.code", "agent.delegate", "agent.route-models"],
  tags: ["primary", "pi"],
  relations: [
    { type: "runs-on", target: "runtime:pi" },
    ...(piDefaultModel ? [{ type: "uses", target: `model:${piDefaultModel}` }] : []),
    ...piMcpNames.map((name) => ({ type: "calls", target: `tool:${name.replaceAll("-", "_")}` })),
    ...currentAgents.filter((row) => row.metadata.source.adapter === "pi-live").map((row) => ({ type: "contains", target: row.metadata.id })),
  ],
  config: { defaultModel: piDefaultModel, settings: piSettingsPath.replace(home, "~"), mcp: piMcpPath.replace(home, "~") },
});

record("Agent", "claude", "Claude", "~/.claude/settings.json", {
  adapter: "agent-system",
  status: "live",
  observed: "live",
  description: "Primary Claude Code agent with its shared skill catalog, governed MCP toolset, and specialist subagents.",
  capabilities: ["agent.code", "agent.delegate", "agent.research"],
  tags: ["primary", "claude-code"],
  relations: [
    { type: "runs-on", target: "runtime:claude-code" },
    { type: "uses", target: "toolset:ops-terminal" },
    ...currentAgents.filter((row) => row.metadata.source.adapter === "claude-code").map((row) => ({ type: "contains", target: row.metadata.id })),
  ],
  config: { settings: "~/.claude/settings.json", agents: "~/.claude/agents/" },
});

const recordIds = new Set(records.map((row) => row.metadata.id));
for (const agent of records.filter((row) => row.kind === "Agent")) {
  for (const relation of agent.spec.relations.filter((row) => row.target.startsWith("model:"))) {
    if (!recordIds.has(relation.target)) {
      const id = relation.target.slice("model:".length);
      record("Model", id, id.replace("/", " · "), agent.metadata.source.locator, {
        adapter: "agent-frontmatter",
        capabilities: [`model.${id.replaceAll("/", ".")}`],
        tags: id.split("/"),
      });
      recordIds.add(relation.target);
    }
  }
}

for (const runtime of records.filter((row) => row.kind === "Runtime")) {
  const allowedAdapters =
    runtime.metadata.id === "runtime:codex"
      ? new Set(["codex-skill", "shared-skill"])
      : runtime.metadata.id === "runtime:claude-code"
        ? new Set(["claude-skill", "shared-skill"])
        : new Set(["shared-skill"]);
  runtime.spec.relations.push(
    ...records
      .filter((row) => row.kind === "Skill" && allowedAdapters.has(row.metadata.source.adapter))
      .map((skill) => ({ type: "contains", target: skill.metadata.id })),
  );
}

const lifecycles = {
  coding: ["code.define", "code.implement", "code.verify", "code.ship"],
  research: ["research.frame", "research.gather", "research.synthesize", "research.publish"],
  planning: ["plan.frame", "plan.decompose", "plan.challenge", "plan.approve"],
  issue: ["issue.capture", "issue.triage", "issue.resolve", "issue.close"],
};
for (const [id, capabilities] of Object.entries(lifecycles)) {
  record("Lifecycle", id, `${id[0].toUpperCase()}${id.slice(1)} lifecycle`, "src/app/channels/lifecycles.ts", {
    adapter: "activity-dashboard",
    version: "1",
    capabilities,
  });
}

records.sort((a, b) => a.kind.localeCompare(b.kind) || a.metadata.name.localeCompare(b.metadata.name));
writeFileSync(output, `${JSON.stringify({ apiVersion: "registry.bencharney.dev/v1alpha1", generatedAt, records, warnings }, null, 2)}\n`);
console.log(`registry snapshot: ${records.length} records → ${basename(output.pathname)}`);
