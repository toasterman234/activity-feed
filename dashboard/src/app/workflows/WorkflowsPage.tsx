"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lifecycle, StageModuleType, StateKind } from "@/app/channels/lifecycles";

type Template = {
  templateId: string;
  version: number;
  label: string;
  description: string;
  definition: Lifecycle;
};

type DraftStage = {
  id: string;
  label: string;
  purpose: string;
  kind: StateKind;
  modules: StageModuleType[];
};

const MODULES: Array<{ type: StageModuleType; label: string }> = [
  { type: "guided-interview", label: "Guided questions" },
  { type: "guided-review", label: "Guided review and approval" },
  { type: "context-scan", label: "Personal context" },
  { type: "agent-run", label: "Agent work" },
  { type: "source-collection", label: "Collect sources" },
  { type: "task-list", label: "Task checklist" },
  { type: "artifact-editor", label: "Create an output" },
  { type: "verification", label: "Verification" },
  { type: "approval", label: "Approval" },
  { type: "publish", label: "Publish/write back" },
  { type: "execution-handoff", label: "Project/repo execution handoff" },
];

function slug(value: string, fallback: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function stagesFrom(template?: Template): DraftStage[] {
  if (!template) {
    return [
      { id: "define", label: "Define", purpose: "Clarify the outcome and success criteria.", kind: "start", modules: ["guided-interview"] },
      { id: "work", label: "Work", purpose: "Complete the core work.", kind: "active", modules: ["agent-run", "artifact-editor"] },
      { id: "review", label: "Review", purpose: "Verify and approve the result.", kind: "wait", modules: ["verification", "approval"] },
      { id: "complete", label: "Complete", purpose: "Publish the durable result.", kind: "done", modules: ["publish"] },
    ];
  }
  return Object.entries(template.definition.states).map(([id, stage]) => ({
    id,
    label: stage.label,
    purpose: stage.purpose || "",
    kind: stage.kind,
    modules: (stage.modules || []).map((module) => module.type),
  }));
}

export default function WorkflowRegistryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [baseId, setBaseId] = useState("");
  const base = templates.find((template) => template.templateId === baseId);
  const [templateId, setTemplateId] = useState("");
  const [label, setLabel] = useState("Custom workflow");
  const [description, setDescription] = useState("A reusable guided workflow.");
  const [stages, setStages] = useState<DraftStage[]>(stagesFrom());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await fetch("/api/workflows", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setTemplates(data.templates || []);
  };
  useEffect(() => { void refresh(); }, []);

  const version = useMemo(() => {
    const matching = templates.filter((template) => template.templateId === templateId);
    return matching.length ? Math.max(...matching.map((template) => template.version)) + 1 : 1;
  }, [templateId, templates]);

  const chooseBase = (id: string) => {
    setBaseId(id);
    const selected = templates.find((template) => template.templateId === id);
    if (!selected) return;
    setTemplateId(`${id}-custom`);
    setLabel(`${selected.label} — Custom`);
    setDescription(selected.description);
    setStages(stagesFrom(selected));
  };

  const updateStage = (index: number, patch: Partial<DraftStage>) => {
    setStages((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage));
  };

  const publish = async () => {
    const cleanId = slug(templateId, "");
    if (!cleanId || stages.length < 2) {
      setStatus("Add an ID and at least two stages.");
      return;
    }
    setBusy(true);
    setStatus(null);
    const stateIds = stages.map((stage, index) => slug(stage.id || stage.label, `stage-${index + 1}`));
    const states: Lifecycle["states"] = {};
    const transitions: Lifecycle["transitions"] = {};
    stages.forEach((stage, index) => {
      const id = stateIds[index];
      const terminal = index === stages.length - 1;
      states[id] = {
        label: stage.label,
        purpose: stage.purpose,
        kind: terminal ? "done" : index === 0 ? "start" : stage.kind,
        terminal,
        modules: stage.modules.map((type, moduleIndex) => ({
          id: `${id}-${type}`,
          type,
          label: MODULES.find((item) => item.type === type)?.label || type,
          order: (moduleIndex + 1) * 10,
          config: type === "guided-interview"
            ? { schema: "research-frame", endpoint: "/api/channels/frame" }
            : type === "guided-review"
              ? { endpoint: "/api/channels/stage-review", reviewKind: "plan", subject: "plan", artifactTitle: "Reviewed plan", approveTo: stateIds[index + 1] || "", reviseTo: stateIds[Math.max(0, index - 1)] || "" }
            : type === "context-scan"
              ? { endpoint: "/api/channels/context-scan", continueTo: stateIds[index + 1] || "", sources: ["graph", "previous-threads", "obsidian", "agent-brain", "life-os"] }
              : {},
        })),
        exitGates: [
          ...(stage.modules.includes("guided-interview")
            ? [{ id: `${id}-interview-approved`, type: "interaction-approved" as const, label: "Guided frame approved", message: "Approve the guided frame before continuing.", toStates: [stateIds[index + 1]], config: { kind: "frame.proposal" } }]
            : []),
          ...(stage.modules.includes("context-scan")
            ? [{ id: `${id}-context-reviewed`, type: "context-reviewed" as const, label: "Personal context reviewed", message: "Review or skip Personal Context before continuing.", toStates: [stateIds[index + 1]] }]
            : []),
          ...(stage.modules.includes("guided-review")
            ? [
                { id: `${id}-reviewed`, type: "artifact-exists" as const, label: "Review completed", message: "Complete the guided review before continuing.", toStates: [stateIds[index + 1]], config: { title: "Reviewed plan" } },
                { id: `${id}-approved`, type: "approval-recorded" as const, label: "Review approved", message: "Approve the review before continuing.", toStates: [stateIds[index + 1]], config: { kind: "stage.approval" } },
              ]
            : []),
        ],
      };
      transitions[id] = terminal ? [] : [stateIds[index + 1]];
    });
    const definition: Lifecycle = {
      label: label.trim(),
      version,
      description: description.trim(),
      initial: stateIds[0],
      states,
      transitions,
      workflows: {},
    };
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: cleanId, definition }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Could not publish workflow.");
      return;
    }
    setTemplateId(cleanId);
    setStatus(`Published ${label} v${version}. It is now available for new tasks.`);
    await refresh();
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-5 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-600">Workflow registry</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Build a lifecycle</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">Start fresh or copy an existing workflow, arrange its stages, attach reusable parts, then publish an immutable version.</p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700"
        >
          ← Back
        </button>
      </div>

      <section className="mt-5 rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="text-xs font-medium">Start from</label>
        <select value={baseId} onChange={(event) => chooseBase(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
          <option value="">A clean workflow</option>
          {templates.map((template) => <option key={template.templateId} value={template.templateId}>{template.label} · v{template.version}</option>)}
        </select>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium">Workflow name<input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" /></label>
          <label className="text-xs font-medium">Registry ID<input value={templateId} onChange={(event) => setTemplateId(slug(event.target.value, ""))} placeholder="e.g. health-research" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" /></label>
        </div>
        <label className="mt-3 block text-xs font-medium">What this workflow is for<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" /></label>
      </section>

      <div className="mt-4 space-y-3">
        {stages.map((stage, index) => (
          <section key={`${stage.id}-${index}`} className="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono text-[9px] dark:bg-zinc-800">Stage {index + 1}</span>
              <input value={stage.label} onChange={(event) => updateStage(index, { label: event.target.value, id: slug(event.target.value, stage.id) })} className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold outline-none" />
              <button disabled={index === 0} onClick={() => setStages((items) => index ? [...items.slice(0, index - 1), items[index], items[index - 1], ...items.slice(index + 1)] : items)} className="text-xs disabled:opacity-25">↑</button>
              <button disabled={index === stages.length - 1} onClick={() => setStages((items) => index < items.length - 1 ? [...items.slice(0, index), items[index + 1], items[index], ...items.slice(index + 2)] : items)} className="text-xs disabled:opacity-25">↓</button>
              <button disabled={stages.length <= 2} onClick={() => setStages((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-xs text-red-500 disabled:opacity-25">Remove</button>
            </div>
            <input value={stage.purpose} onChange={(event) => updateStage(index, { purpose: event.target.value })} placeholder="What should be accomplished here?" className="mt-2 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <div className="mt-3 flex flex-wrap gap-2">
              {MODULES.map((module) => {
                const active = stage.modules.includes(module.type);
                return <button key={module.type} onClick={() => updateStage(index, { modules: active ? stage.modules.filter((item) => item !== module.type) : [...stage.modules, module.type] })} className={`rounded-full border px-2.5 py-1 text-[11px] ${active ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}>{module.label}</button>;
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 pb-16">
        <button onClick={() => setStages((items) => [...items, { id: `stage-${items.length + 1}`, label: "New stage", purpose: "", kind: "active", modules: [] }])} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700">Add stage</button>
        <button onClick={() => { void publish(); }} disabled={busy} className="rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950">{busy ? "Publishing…" : `Publish version ${version}`}</button>
        {status && <p className="text-xs text-zinc-500">{status}</p>}
      </div>
    </main>
  );
}
