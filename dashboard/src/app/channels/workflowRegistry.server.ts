import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";
import {
  LIFECYCLES,
  validateLifecycleDefinition,
  type Lifecycle,
} from "./lifecycles";

type Queryable = Pick<Pool | PoolClient, "query">;

export interface WorkflowTemplateRecord {
  templateId: string;
  version: number;
  label: string;
  description: string;
  definition: Lifecycle;
  status: "published" | "retired";
  checksum: string;
  createdAt: string;
  publishedAt: string | null;
}

function canonicalDefinition(definition: Lifecycle): string {
  return JSON.stringify(definition);
}

function checksum(definition: Lifecycle): string {
  return createHash("sha256").update(canonicalDefinition(definition)).digest("hex");
}

export async function ensureBundledWorkflowTemplates(db: Queryable): Promise<void> {
  for (const [templateId, definition] of Object.entries(LIFECYCLES)) {
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO workflow_templates
         (template_id, version, label, description, definition, status, checksum, created_at, published_at)
       VALUES ($1, $2, $3, $4, $5, 'published', $6, $7, $7)
       ON CONFLICT (template_id, version) DO NOTHING`,
      [
        templateId,
        definition.version,
        definition.label,
        definition.description,
        canonicalDefinition(definition),
        checksum(definition),
        now,
      ],
    );
  }
}

export async function listWorkflowTemplates(db: Queryable): Promise<WorkflowTemplateRecord[]> {
  await ensureBundledWorkflowTemplates(db);
  const result = await db.query(
    `SELECT DISTINCT ON (template_id)
       template_id, version, label, description, definition, status, checksum, created_at, published_at
     FROM workflow_templates
     WHERE status = 'published'
     ORDER BY template_id, version DESC`,
  );
  return result.rows.map(toRecord);
}

export async function getWorkflowTemplate(
  db: Queryable,
  templateId: string,
  version?: number,
): Promise<WorkflowTemplateRecord | null> {
  await ensureBundledWorkflowTemplates(db);
  const result = await db.query(
    `SELECT template_id, version, label, description, definition, status, checksum, created_at, published_at
       FROM workflow_templates
      WHERE template_id = $1
        AND ($2::integer IS NULL OR version = $2)
        AND status = 'published'
      ORDER BY version DESC
      LIMIT 1`,
    [templateId, version ?? null],
  );
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

export async function publishWorkflowTemplate(
  db: Queryable,
  templateId: string,
  definition: Lifecycle,
): Promise<WorkflowTemplateRecord> {
  const errors = validateLifecycleDefinition(templateId, definition);
  if (errors.length) throw new Error(errors.join("; "));
  const existing = await db.query(
    `SELECT 1 FROM workflow_templates WHERE template_id = $1 AND version = $2`,
    [templateId, definition.version],
  );
  if (existing.rows[0]) throw new Error(`Template ${templateId} v${definition.version} already exists`);
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO workflow_templates
       (template_id, version, label, description, definition, status, checksum, created_at, published_at)
     VALUES ($1, $2, $3, $4, $5, 'published', $6, $7, $7)`,
    [templateId, definition.version, definition.label, definition.description, canonicalDefinition(definition), checksum(definition), now],
  );
  return (await getWorkflowTemplate(db, templateId, definition.version))!;
}

function toRecord(row: Record<string, unknown>): WorkflowTemplateRecord {
  return {
    templateId: String(row.template_id),
    version: Number(row.version),
    label: String(row.label),
    description: String(row.description),
    definition: JSON.parse(String(row.definition)) as Lifecycle,
    status: String(row.status) as WorkflowTemplateRecord["status"],
    checksum: String(row.checksum),
    createdAt: String(row.created_at),
    publishedAt: row.published_at ? String(row.published_at) : null,
  };
}
