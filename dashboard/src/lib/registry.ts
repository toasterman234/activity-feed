export type RegistryKind =
  | "Agent"
  | "Skill"
  | "Tool"
  | "Toolset"
  | "Model"
  | "Workflow"
  | "Lifecycle"
  | "Policy"
  | "Runtime"
  | "Service";

export type RegistryStatus = "live" | "active" | "degraded" | "draft" | "deprecated" | "retired" | "unknown";

export type RegistryRelation = {
  type: "uses" | "calls" | "runs-on" | "governed-by" | "participates-in" | "contains" | "replaces";
  target: string;
};

export type RegistryRecord = {
  apiVersion: "registry.bencharney.dev/v1alpha1";
  kind: RegistryKind;
  metadata: {
    id: string;
    name: string;
    description?: string;
    version?: string;
    owner?: string;
    status: RegistryStatus;
    aliases?: string[];
    tags?: string[];
    source: {
      adapter: string;
      locator: string;
      observedAt?: string;
    };
  };
  spec: {
    capabilities: string[];
    relations: RegistryRelation[];
    config?: Record<string, unknown>;
  };
  observed?: {
    status: RegistryStatus;
    observedAt?: string;
    reason?: string;
  };
};

export type RegistrySnapshot = {
  apiVersion: "registry.bencharney.dev/v1alpha1";
  generatedAt: string;
  records: RegistryRecord[];
  warnings: string[];
};

export type HandlingPath = {
  id: string;
  label: string;
  entrypoint: RegistryRecord;
  chain: RegistryRecord[];
  availability: RegistryStatus;
  matchedCapabilities: string[];
  blockers: string[];
  impact: {
    dependents: number;
    confidence: "high" | "medium" | "low";
  };
};

const TOKEN_RE = /[a-z0-9]+/g;

function tokens(value: string) {
  return new Set(value.toLowerCase().match(TOKEN_RE) || []);
}

function overlap(query: Set<string>, value: string) {
  const haystack = tokens(value);
  let score = 0;
  for (const token of query) {
    if (haystack.has(token)) score += 1;
    for (const candidate of haystack) {
      if (candidate.startsWith(token) || token.startsWith(candidate)) score += 0.25;
    }
  }
  return score;
}

export function buildRegistryIndexes(records: RegistryRecord[]) {
  const byId = new Map(records.map((record) => [record.metadata.id, record]));
  const dependents = new Map<string, RegistryRecord[]>();
  for (const record of records) {
    for (const relation of record.spec.relations) {
      const rows = dependents.get(relation.target) || [];
      rows.push(record);
      dependents.set(relation.target, rows);
    }
  }
  return { byId, dependents };
}

export function resolveCapabilities(records: RegistryRecord[], queryText: string): HandlingPath[] {
  const query = tokens(queryText);
  if (!query.size) return [];
  const { byId, dependents } = buildRegistryIndexes(records);

  return records
    .map((record) => {
      const capabilityText = record.spec.capabilities.join(" ");
      const score =
        overlap(query, `${record.metadata.name} ${record.metadata.description || ""}`) * 2 +
        overlap(query, capabilityText) * 3 +
        overlap(query, (record.metadata.tags || []).join(" "));
      const chain: RegistryRecord[] = [];
      const blockers: string[] = [];
      for (const relation of record.spec.relations) {
        const target = byId.get(relation.target);
        if (target) {
          chain.push(target);
          if (["retired", "degraded"].includes(target.observed?.status || target.metadata.status)) {
            blockers.push(`${target.metadata.name} is ${target.observed?.status || target.metadata.status}`);
          }
        }
      }
      return {
        score,
        path: {
          id: record.metadata.id,
          label: [record, ...chain].map((item) => item.metadata.name).join(" → "),
          entrypoint: record,
          chain,
          availability: blockers.length ? "degraded" : record.observed?.status || record.metadata.status,
          matchedCapabilities: record.spec.capabilities.filter((capability) => overlap(query, capability) > 0),
          blockers,
          impact: {
            dependents: dependents.get(record.metadata.id)?.length || 0,
            confidence: record.metadata.source.adapter === "curated" ? "medium" : "high",
          },
        } satisfies HandlingPath,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((result) => result.path);
}
