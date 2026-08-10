#!/usr/bin/env python3
"""Local experiment tracker with idea capture, discovery, intake, and experiment docs."""

from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OWNER = "Ben"
IDEA_STATUSES = {"captured", "discovering", "reviewed", "approved", "rejected", "converted"}
EXPERIMENT_STATUSES = {"proposed", "active", "paused", "done", "killed"}
READY_RECOMMENDATIONS = {"ready"}
INTAKE_RECOMMENDATIONS = {"ready", "needs_detail", "duplicate", "do_not_start"}
DISCOVERY_RECOMMENDATIONS = {"promising", "unclear", "probably_duplicate", "not_worth_running_yet"}


@dataclass
class ParsedCommand:
    action: str
    fields: dict[str, Any]


@dataclass
class ParsedBlock:
    header: str | None
    fields: dict[str, Any]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def root_path(root: str | None) -> Path:
    return Path(root or ".").resolve()


def experiments_dir(root: Path) -> Path:
    return root / "experiments"


def ideas_dir(root: Path) -> Path:
    return experiments_dir(root) / "ideas"


def registry_path(root: Path) -> Path:
    return experiments_dir(root) / "registry.json"


def canvas_path(root: Path) -> Path:
    return experiments_dir(root) / "CANVAS.md"


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "item"


def _stringify(value: Any) -> str | None:
    """Coerce a parsed value (possibly a list) to a single string."""
    if value is None:
        return None
    if isinstance(value, list):
        return value[0] if value else None
    return str(value)


def unique_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        clean = value.strip()
        if clean and clean not in seen:
            seen.add(clean)
            ordered.append(clean)
    return ordered


def load_registry(root: Path) -> dict[str, Any]:
    path = registry_path(root)
    if not path.exists():
        return {"ideas": [], "experiments": []}
    data = json.loads(path.read_text())
    if "ideas" not in data:
        data["ideas"] = []
    if "experiments" not in data:
        data["experiments"] = []
    return data


def save_registry(root: Path, registry: dict[str, Any]) -> None:
    path = registry_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(registry, indent=2) + "\n")


def next_idea_id(registry: dict[str, Any]) -> str:
    existing = {str(item.get("id")) for item in registry.get("ideas", [])}
    index = 1
    while True:
        candidate = f"idea-{index:03d}"
        if candidate not in existing:
            return candidate
        index += 1


def next_experiment_id(name: str, registry: dict[str, Any]) -> str:
    base = slugify(name)
    existing = {str(item.get("id")) for item in registry.get("experiments", [])}
    index = 1
    while True:
        candidate = f"{base}-{index:02d}"
        if candidate not in existing:
            return candidate
        index += 1


def parse_loose_block(text: str) -> ParsedBlock:
    # Handle literal \n in text (e.g. when $'...' expansion fails in some shells)
    if "\n" not in text and "\\n" in text:
        text = text.replace("\\n", "\n")
    lines = [line.rstrip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        raise ValueError("Text is empty")

    header: str | None = None
    fields: dict[str, Any] = {}
    first = lines[0]
    if ":" not in first or first.lower().startswith(("new idea:", "new experiment:", "experiment update:")):
        header = first
        body = lines[1:]
    else:
        body = lines

    multi_keys = {
        "note", "decision", "result", "link", "tag", "constraint", "open question",
        "inspiration", "github project", "web resource", "risk", "missing", "test task",
    }
    for line in body:
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        key = key.strip().lower()
        value = raw_value.strip()
        if not value:
            continue
        if key in multi_keys:
            fields.setdefault(key, []).append(value)
        elif key == "tags":
            fields.setdefault("tag", []).extend([item.strip() for item in value.split(",") if item.strip()])
        else:
            fields[key] = value

    return ParsedBlock(header=header, fields=fields)


def parse_command_text(text: str) -> ParsedCommand:
    block = parse_loose_block(text)
    if not block.header:
        raise ValueError("First line must start with 'new experiment:' or 'experiment update:'")

    header = block.header
    fields = deepcopy(block.fields)
    if header.lower().startswith("new experiment:"):
        fields["name"] = header.split(":", 1)[1].strip()
        return ParsedCommand(action="create", fields=fields)
    if header.lower().startswith("experiment update:"):
        fields["id"] = header.split(":", 1)[1].strip()
        return ParsedCommand(action="update", fields=fields)
    raise ValueError("First line must start with 'new experiment:' or 'experiment update:'")


def normalize_experiment_fields(raw_fields: dict[str, Any]) -> dict[str, Any]:
    fields = deepcopy(raw_fields)
    normalized: dict[str, Any] = {}

    if "name" in fields:
        normalized["name"] = fields["name"]
    if "id" in fields:
        normalized["id"] = fields["id"]

    normalized["owner"] = fields.get("owner", DEFAULT_OWNER)
    normalized["goal"] = fields.get("goal")
    normalized["successSignal"] = fields.get("success signal")
    normalized["stopSignal"] = fields.get("stop signal")
    normalized["status"] = fields.get("status", "active")
    normalized["repoPath"] = fields.get("repo path") or fields.get("repo")
    normalized["nextReviewAt"] = fields.get("review")
    normalized["latestSummary"] = fields.get("latest summary") or fields.get("summary")
    normalized["notes"] = fields.get("note", [])
    normalized["decisions"] = fields.get("decision", [])
    normalized["results"] = fields.get("result", [])
    normalized["links"] = unique_list(fields.get("link", []))
    normalized["tags"] = unique_list(fields.get("tag", []))
    normalized["comparisonBaseline"] = fields.get("comparison baseline")

    status = normalized["status"]
    if status and status not in EXPERIMENT_STATUSES:
        raise ValueError(f"Invalid experiment status: {status}")

    return normalized


def normalize_idea_capture_fields(text: str) -> dict[str, Any]:
    block = parse_loose_block(text)
    fields = deepcopy(block.fields)
    header = block.header or ""
    if header.lower().startswith("new idea:"):
        fields["name"] = header.split(":", 1)[1].strip()
    elif "name" not in fields:
        raise ValueError("Capture text needs 'new idea: <name>' or 'name: <name>'")

    return {
        "name": fields["name"],
        "type": fields.get("type"),
        "summary": fields.get("summary") or fields.get("what is the experiment"),
        "whyNow": fields.get("why now"),
        "goal": fields.get("goal"),
        "owner": fields.get("owner", DEFAULT_OWNER),
        "repoPath": fields.get("repo path") or fields.get("repo"),
        "reviewDate": fields.get("review"),
        "successSignal": fields.get("success signal"),
        "stopSignal": fields.get("stop signal"),
        "links": unique_list(fields.get("link", [])),
        "tags": unique_list(fields.get("tag", [])),
        "notes": fields.get("note", []),
    }


def normalize_discovery_fields(text: str) -> dict[str, Any]:
    fields = parse_loose_block(text).fields
    recommendation = fields.get("recommendation")
    if recommendation and recommendation not in DISCOVERY_RECOMMENDATIONS:
        raise ValueError(f"Invalid discovery recommendation: {recommendation}")
    return {
        "problem": fields.get("problem"),
        "desiredOutcome": fields.get("desired outcome"),
        "decision": fields.get("decision"),
        "currentWorkflow": fields.get("current workflow"),
        "constraints": unique_list(fields.get("constraint", [])),
        "githubProjects": unique_list(fields.get("github project", [])),
        "webResources": unique_list(fields.get("web resource", [])),
        "inspirations": unique_list(fields.get("inspiration", [])),
        "openQuestions": unique_list(fields.get("open question", [])),
        "recommendation": recommendation,
        "notes": fields.get("note", []),
    }


def normalize_intake_fields(text: str) -> dict[str, Any]:
    fields = parse_loose_block(text).fields
    recommendation = fields.get("recommendation")
    if recommendation and recommendation not in INTAKE_RECOMMENDATIONS:
        raise ValueError(f"Invalid intake recommendation: {recommendation}")
    return {
        "goal": fields.get("goal"),
        "successSignal": fields.get("success signal"),
        "stopSignal": fields.get("stop signal"),
        "repoPath": fields.get("repo path") or fields.get("repo"),
        "reviewDate": fields.get("review"),
        "duplicateOf": fields.get("duplicate of"),
        "recommendation": recommendation,
        "riskLevel": fields.get("risk level"),
        "evalPlan": fields.get("eval plan"),
        "missing": unique_list(fields.get("missing", [])),
        "risks": unique_list(fields.get("risk", [])),
        "testTasks": unique_list(fields.get("test task", [])),
        "notes": fields.get("note", []),
    }


def find_idea(registry: dict[str, Any], idea_id: str) -> dict[str, Any] | None:
    for item in registry.get("ideas", []):
        if item.get("id") == idea_id:
            return item
    return None


def find_experiment(registry: dict[str, Any], experiment_id: str) -> dict[str, Any] | None:
    for item in registry.get("experiments", []):
        if item.get("id") == experiment_id:
            return item
    return None


def idea_doc_path(root: Path, idea_id: str) -> Path:
    return ideas_dir(root) / idea_id / "IDEA.md"


def discovery_doc_path(root: Path, idea_id: str) -> Path:
    return ideas_dir(root) / idea_id / "discovery.md"


def intake_doc_path(root: Path, idea_id: str) -> Path:
    return ideas_dir(root) / idea_id / "intake.md"


def experiment_doc_path(root: Path, experiment_id: str) -> Path:
    return experiments_dir(root) / experiment_id / "README.md"


def evals_doc_path(root: Path, experiment_id: str) -> Path:
    return experiments_dir(root) / experiment_id / "evals.md"


def runs_doc_path(root: Path, experiment_id: str) -> Path:
    return experiments_dir(root) / experiment_id / "runs.md"


def render_idea_doc(idea: dict[str, Any]) -> str:
    lines = [
        f"# {idea['name']}",
        "",
        f"- ID: {idea['id']}",
        f"- Status: {idea['status']}",
        f"- Owner: {idea.get('owner') or DEFAULT_OWNER}",
        f"- Type: {idea.get('type') or 'TBD'}",
        f"- Created: {(idea.get('createdAt') or '')[:10]}",
        f"- Repo: {idea.get('repoPath') or 'TBD'}",
        f"- Review date: {idea.get('reviewDate') or 'TBD'}",
        "",
        "## Summary",
        idea.get("summary") or "TBD",
        "",
        "## Why now",
        idea.get("whyNow") or "TBD",
        "",
        "## Goal",
        idea.get("goal") or "TBD",
        "",
        "## Success signal",
        idea.get("successSignal") or "TBD",
        "",
        "## Stop signal",
        idea.get("stopSignal") or "TBD",
        "",
        "## Notes",
    ]
    notes = idea.get("notes") or []
    if notes:
        for note in notes:
            lines.append(f"- {note}")
    else:
        lines.append("- None yet.")

    lines.extend(["", "## Links"])
    links = idea.get("links") or []
    if links:
        for link in links:
            lines.append(f"- {link}")
    else:
        lines.append("- None yet.")

    tags = idea.get("tags") or []
    if tags:
        lines.extend(["", "## Tags", "- " + ", ".join(tags)])

    return "\n".join(lines) + "\n"


def render_discovery_doc(idea: dict[str, Any]) -> str:
    discovery = idea.get("discovery") or {}
    lines = [
        f"# Discovery — {idea['name']}",
        "",
        f"- Idea: {idea['id']}",
        f"- Status: {idea['status']}",
        f"- Recommendation: {discovery.get('recommendation') or 'TBD'}",
        "",
        "## Problem",
        discovery.get("problem") or idea.get("summary") or "TBD",
        "",
        "## Desired outcome",
        discovery.get("desiredOutcome") or idea.get("goal") or "TBD",
        "",
        "## Decision this should inform",
        _stringify(discovery.get("decision")) or idea.get("whyNow") or "TBD",
        "",
        "## Current workflow",
        discovery.get("currentWorkflow") or "TBD",
        "",
        "## Constraints",
    ]
    for section_key, empty in [
        ("constraints", "- Add cost / speed / reliability / autonomy constraints."),
        ("githubProjects", "- Add GitHub repos or inspiration links."),
        ("webResources", "- Add web articles, docs, or notes."),
        ("inspirations", "- Add design ideas worth copying."),
        ("openQuestions", "- Add questions that still block a decision."),
        ("notes", "- None yet."),
    ]:
        values = discovery.get(section_key) or []
        if section_key == "constraints":
            if values:
                for value in values:
                    lines.append(f"- {value}")
            else:
                lines.append(empty)
            lines.extend(["", "## Similar GitHub projects"])
        elif section_key == "githubProjects":
            if values:
                for value in values:
                    lines.append(f"- {value}")
            else:
                lines.append(empty)
            lines.extend(["", "## Web research"])
        elif section_key == "webResources":
            if values:
                for value in values:
                    lines.append(f"- {value}")
            else:
                lines.append(empty)
            lines.extend(["", "## Patterns worth copying"])
        elif section_key == "inspirations":
            if values:
                for value in values:
                    lines.append(f"- {value}")
            else:
                lines.append(empty)
            lines.extend(["", "## Open questions"])
        elif section_key == "openQuestions":
            if values:
                for value in values:
                    lines.append(f"- {value}")
            else:
                lines.append(empty)
            lines.extend(["", "## Notes"])
        elif section_key == "notes":
            if values:
                for value in values:
                    lines.append(f"- {value}")
            else:
                lines.append(empty)

    return "\n".join(lines) + "\n"


def render_intake_doc(idea: dict[str, Any], review: dict[str, Any]) -> str:
    lines = [
        f"# Intake Review — {idea['name']}",
        "",
        f"- Idea: {idea['id']}",
        f"- Recommendation: {review.get('recommendation') or 'TBD'}",
        f"- Risk level: {review.get('riskLevel') or 'TBD'}",
        "",
        "## Summary",
        idea.get("summary") or "TBD",
        "",
        "## Goal clarity",
        review.get("goal") or idea.get("goal") or "TBD",
        "",
        "## Success signal",
        review.get("successSignal") or idea.get("successSignal") or "TBD",
        "",
        "## Stop signal",
        review.get("stopSignal") or idea.get("stopSignal") or "TBD",
        "",
        "## Repo / path",
        review.get("repoPath") or idea.get("repoPath") or "TBD",
        "",
        "## Review date",
        review.get("reviewDate") or idea.get("reviewDate") or "TBD",
        "",
        "## Duplicate check",
        review.get("duplicateOf") or "No duplicate recorded.",
        "",
        "## Missing pieces",
    ]

    missing = review.get("missing") or []
    if missing:
        for item in missing:
            lines.append(f"- {item}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Risks"])
    risks = review.get("risks") or []
    if risks:
        for risk in risks:
            lines.append(f"- {risk}")
    else:
        lines.append("- None recorded.")

    lines.extend(["", "## Eval plan"])
    if review.get("evalPlan"):
        lines.append(review["evalPlan"])
    else:
        lines.append("TBD")

    lines.extend(["", "## Test tasks"])
    test_tasks = review.get("testTasks") or []
    if test_tasks:
        for task in test_tasks:
            lines.append(f"- {task}")
    else:
        lines.append("- Add sample tasks before running the experiment.")

    lines.extend(["", "## Notes"])
    notes = review.get("notes") or []
    if notes:
        for note in notes:
            lines.append(f"- {note}")
    else:
        lines.append("- None yet.")

    return "\n".join(lines) + "\n"


def render_experiment_doc(experiment: dict[str, Any]) -> str:
    lines = [
        f"# {experiment['name']}",
        "",
        f"- ID: {experiment['id']}",
        f"- Source idea: {experiment.get('sourceIdeaId') or 'n/a'}",
        f"- Status: {experiment['status']}",
        f"- Owner: {experiment.get('owner') or DEFAULT_OWNER}",
        f"- Started: {(experiment.get('startedAt') or '')[:10]}",
        f"- Goal: {experiment.get('goal') or 'TBD'}",
        f"- Success signal: {experiment.get('successSignal') or 'TBD'}",
        f"- Stop signal: {experiment.get('stopSignal') or 'TBD'}",
        f"- Repo: {experiment.get('repoPath') or 'TBD'}",
        f"- Next review: {experiment.get('nextReviewAt') or 'TBD'}",
        "",
        "## Latest summary",
        experiment.get("latestSummary") or "No summary yet.",
        "",
        "## Updates",
    ]

    history = experiment.get("history", [])
    if history:
        for item in history:
            lines.append(f"- {item.get('at', '')[:10]} [{item.get('kind', 'note')}] {item.get('text', '')}")
    else:
        lines.append("- No updates yet.")

    lines.extend(["", "## Links"])
    links = experiment.get("links") or []
    if links:
        for link in links:
            lines.append(f"- {link}")
    else:
        lines.append("- None yet.")

    tags = experiment.get("tags") or []
    if tags:
        lines.extend(["", "## Tags", "- " + ", ".join(tags)])

    lines.extend([
        "",
        "## Related docs",
        f"- Evals: {experiment.get('evalsPath') or 'TBD'}",
        f"- Runs: {experiment.get('runsPath') or 'TBD'}",
    ])

    return "\n".join(lines) + "\n"


def render_evals_doc(experiment: dict[str, Any]) -> str:
    intake = experiment.get("intake") or {}
    lines = [
        f"# Eval Plan — {experiment['name']}",
        "",
        "## Decision this experiment should inform",
        experiment.get("comparisonBaseline") or experiment.get("goal") or "TBD",
        "",
        "## Test tasks",
    ]
    tasks = intake.get("testTasks") or []
    if tasks:
        for task in tasks:
            lines.append(f"- {task}")
    else:
        lines.append("- Add 3-5 representative tasks.")

    lines.extend([
        "",
        "## Success criteria",
        experiment.get("successSignal") or "TBD",
        "",
        "## Failure criteria",
        experiment.get("stopSignal") or "TBD",
        "",
        "## Comparison baseline",
        experiment.get("comparisonBaseline") or "TBD",
        "",
        "## Notes",
        "- Track cost, speed, reliability, and quality for each run.",
    ])
    return "\n".join(lines) + "\n"


def render_runs_doc(experiment: dict[str, Any]) -> str:
    return "\n".join([
        f"# Runs — {experiment['name']}",
        "",
        "Use this file to log actual runs over time.",
        "",
        "## Template",
        "- Date:",
        "- Task:",
        "- Result:",
        "- Cost / time:",
        "- Notes:",
        "",
    ])


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def write_idea_docs(root: Path, idea: dict[str, Any]) -> None:
    write_text(idea_doc_path(root, idea["id"]), render_idea_doc(idea))
    write_text(discovery_doc_path(root, idea["id"]), render_discovery_doc(idea))
    review = idea.get("intake") or derive_intake_review(idea)
    write_text(intake_doc_path(root, idea["id"]), render_intake_doc(idea, review))


def write_experiment_docs(root: Path, experiment: dict[str, Any]) -> None:
    write_text(experiment_doc_path(root, experiment["id"]), render_experiment_doc(experiment))
    write_text(evals_doc_path(root, experiment["id"]), render_evals_doc(experiment))
    write_text(runs_doc_path(root, experiment["id"]), render_runs_doc(experiment))


def derive_intake_review(idea: dict[str, Any]) -> dict[str, Any]:
    review = deepcopy(idea.get("intake") or {})
    review.setdefault("goal", idea.get("goal"))
    review.setdefault("successSignal", idea.get("successSignal"))
    review.setdefault("stopSignal", idea.get("stopSignal"))
    review.setdefault("repoPath", idea.get("repoPath"))
    review.setdefault("reviewDate", idea.get("reviewDate"))
    review.setdefault("riskLevel", "medium")
    review.setdefault("missing", [])
    review.setdefault("risks", [])
    review.setdefault("testTasks", [])
    review.setdefault("notes", [])

    missing = list(review.get("missing") or [])
    if not review.get("goal"):
        missing.append("Add a clear goal.")
    if not review.get("successSignal"):
        missing.append("Add a measurable success signal.")
    if not review.get("stopSignal"):
        missing.append("Add a stop signal.")
    if not review.get("repoPath"):
        missing.append("Add the repo/path where this lives.")
    review["missing"] = unique_list(missing)

    if review.get("duplicateOf"):
        review["recommendation"] = "duplicate"
    elif review["missing"]:
        review.setdefault("recommendation", "needs_detail")
    else:
        review.setdefault("recommendation", "ready")

    return review


def append_history(experiment: dict[str, Any], entries: list[str], kind: str, timestamp: str) -> None:
    if not entries:
        return
    history = experiment.setdefault("history", [])
    for text in entries:
        history.append({"at": timestamp, "kind": kind, "text": text})


def capture_idea(root: Path, fields: dict[str, Any]) -> dict[str, Any]:
    registry = load_registry(root)
    timestamp = now_iso()
    idea_id = next_idea_id(registry)
    idea = {
        "id": idea_id,
        "name": fields["name"],
        "status": "captured",
        "createdAt": timestamp,
        "lastUpdatedAt": timestamp,
        "owner": fields.get("owner", DEFAULT_OWNER),
        "type": fields.get("type"),
        "summary": fields.get("summary"),
        "whyNow": fields.get("whyNow"),
        "goal": fields.get("goal"),
        "repoPath": fields.get("repoPath"),
        "reviewDate": fields.get("reviewDate"),
        "successSignal": fields.get("successSignal"),
        "stopSignal": fields.get("stopSignal"),
        "links": fields.get("links", []),
        "tags": fields.get("tags", []),
        "notes": fields.get("notes", []),
        "paths": {
            "ideaDoc": f"experiments/ideas/{idea_id}/IDEA.md",
            "discoveryDoc": f"experiments/ideas/{idea_id}/discovery.md",
            "intakeDoc": f"experiments/ideas/{idea_id}/intake.md",
        },
        "discovery": {},
        "intake": {},
    }
    registry.setdefault("ideas", []).append(idea)
    save_registry(root, registry)
    write_idea_docs(root, idea)
    write_canvas(root, registry)
    return idea


def discover_idea(root: Path, idea_id: str, fields: dict[str, Any] | None = None) -> dict[str, Any]:
    registry = load_registry(root)
    idea = find_idea(registry, idea_id)
    if idea is None:
        raise ValueError(f"Idea not found: {idea_id}")

    fields = fields or {}
    discovery = deepcopy(idea.get("discovery") or {})
    for key in ["problem", "desiredOutcome", "decision", "currentWorkflow", "recommendation"]:
        value = fields.get(key)
        if value:
            discovery[key] = value
    for key in ["constraints", "githubProjects", "webResources", "inspirations", "openQuestions", "notes"]:
        values = fields.get(key) or []
        merged = unique_list((discovery.get(key) or []) + values)
        if merged:
            discovery[key] = merged

    idea["discovery"] = discovery
    idea["status"] = "reviewed" if discovery.get("recommendation") else "discovering"
    idea["lastUpdatedAt"] = now_iso()
    save_registry(root, registry)
    write_idea_docs(root, idea)
    write_canvas(root, registry)
    return idea


def intake_idea(root: Path, idea_id: str, fields: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    registry = load_registry(root)
    idea = find_idea(registry, idea_id)
    if idea is None:
        raise ValueError(f"Idea not found: {idea_id}")

    fields = fields or {}
    review = deepcopy(idea.get("intake") or {})
    for key in ["goal", "successSignal", "stopSignal", "repoPath", "reviewDate", "duplicateOf", "recommendation", "riskLevel", "evalPlan"]:
        value = fields.get(key)
        if value:
            review[key] = value
    for key in ["missing", "risks", "testTasks", "notes"]:
        values = fields.get(key) or []
        merged = unique_list((review.get(key) or []) + values)
        if merged:
            review[key] = merged

    idea["goal"] = review.get("goal") or idea.get("goal")
    idea["successSignal"] = review.get("successSignal") or idea.get("successSignal")
    idea["stopSignal"] = review.get("stopSignal") or idea.get("stopSignal")
    idea["repoPath"] = review.get("repoPath") or idea.get("repoPath")
    idea["reviewDate"] = review.get("reviewDate") or idea.get("reviewDate")
    idea["intake"] = derive_intake_review({**idea, "intake": review})
    idea["status"] = "approved" if idea["intake"].get("recommendation") in READY_RECOMMENDATIONS else "reviewed"
    idea["lastUpdatedAt"] = now_iso()

    save_registry(root, registry)
    write_idea_docs(root, idea)
    write_canvas(root, registry)
    return idea, idea["intake"]


def create_experiment(root: Path, fields: dict[str, Any]) -> dict[str, Any]:
    registry = load_registry(root)
    timestamp = now_iso()
    experiment_id = next_experiment_id(fields["name"], registry)
    experiment = {
        "id": experiment_id,
        "sourceIdeaId": fields.get("sourceIdeaId"),
        "name": fields["name"],
        "owner": fields.get("owner", DEFAULT_OWNER),
        "status": fields.get("status", "active"),
        "createdAt": timestamp,
        "startedAt": timestamp,
        "lastUpdateAt": timestamp,
        "goal": fields.get("goal"),
        "successSignal": fields.get("successSignal"),
        "stopSignal": fields.get("stopSignal"),
        "repoPath": fields.get("repoPath"),
        "docsPath": f"experiments/{experiment_id}/README.md",
        "evalsPath": f"experiments/{experiment_id}/evals.md",
        "runsPath": f"experiments/{experiment_id}/runs.md",
        "buzzChannel": "experiments",
        "buzzThreadRoot": None,
        "links": unique_list(fields.get("links", [])),
        "tags": unique_list(fields.get("tags", [])),
        "latestSummary": fields.get("latestSummary") or "Created experiment.",
        "nextReviewAt": fields.get("nextReviewAt"),
        "comparisonBaseline": fields.get("comparisonBaseline"),
        "history": [],
        "intake": deepcopy(fields.get("intake") or {}),
    }
    append_history(experiment, ["Created experiment scaffold."], "note", timestamp)
    append_history(experiment, fields.get("notes", []), "note", timestamp)
    append_history(experiment, fields.get("decisions", []), "decision", timestamp)
    append_history(experiment, fields.get("results", []), "result", timestamp)
    registry.setdefault("experiments", []).append(experiment)
    save_registry(root, registry)
    write_experiment_docs(root, experiment)
    write_canvas(root, registry)
    return experiment


def create_experiment_from_idea(root: Path, idea_id: str, force: bool = False) -> tuple[dict[str, Any], dict[str, Any]]:
    registry = load_registry(root)
    idea = find_idea(registry, idea_id)
    if idea is None:
        raise ValueError(f"Idea not found: {idea_id}")

    review = derive_intake_review(idea)
    recommendation = review.get("recommendation")
    if recommendation not in READY_RECOMMENDATIONS and not force:
        raise ValueError(f"Idea {idea_id} is not ready to create. Recommendation: {recommendation}")

    experiment_fields = {
        "sourceIdeaId": idea["id"],
        "name": idea["name"],
        "owner": idea.get("owner", DEFAULT_OWNER),
        "status": "active",
        "goal": review.get("goal") or idea.get("goal"),
        "successSignal": review.get("successSignal") or idea.get("successSignal"),
        "stopSignal": review.get("stopSignal") or idea.get("stopSignal"),
        "repoPath": review.get("repoPath") or idea.get("repoPath"),
        "nextReviewAt": review.get("reviewDate") or idea.get("reviewDate"),
        "latestSummary": idea.get("summary") or "Created from idea intake.",
        "links": idea.get("links", []),
        "tags": idea.get("tags", []),
        "notes": idea.get("notes", []),
        "comparisonBaseline": review.get("evalPlan") or idea.get("whyNow"),
        "intake": review,
    }

    experiment = create_experiment(root, experiment_fields)

    registry = load_registry(root)
    idea = find_idea(registry, idea_id)
    assert idea is not None
    idea["status"] = "converted"
    idea["convertedExperimentId"] = experiment["id"]
    idea["lastUpdatedAt"] = now_iso()
    save_registry(root, registry)
    write_idea_docs(root, idea)
    write_canvas(root, registry)
    return idea, experiment


def update_experiment(root: Path, fields: dict[str, Any]) -> dict[str, Any]:
    registry = load_registry(root)
    experiment = find_experiment(registry, fields["id"])
    if experiment is None:
        raise ValueError(f"Experiment not found: {fields['id']}")

    timestamp = now_iso()
    for key, value in {
        "owner": fields.get("owner"),
        "goal": fields.get("goal"),
        "status": fields.get("status"),
        "successSignal": fields.get("successSignal"),
        "stopSignal": fields.get("stopSignal"),
        "repoPath": fields.get("repoPath"),
        "nextReviewAt": fields.get("nextReviewAt"),
        "latestSummary": fields.get("latestSummary"),
        "comparisonBaseline": fields.get("comparisonBaseline"),
    }.items():
        if value:
            experiment[key] = value

    existing_links = experiment.setdefault("links", [])
    for link in fields.get("links", []):
        if link not in existing_links:
            existing_links.append(link)

    existing_tags = experiment.setdefault("tags", [])
    for tag in fields.get("tags", []):
        if tag not in existing_tags:
            existing_tags.append(tag)

    append_history(experiment, fields.get("notes", []), "note", timestamp)
    append_history(experiment, fields.get("decisions", []), "decision", timestamp)
    append_history(experiment, fields.get("results", []), "result", timestamp)
    experiment["lastUpdateAt"] = timestamp

    save_registry(root, registry)
    write_experiment_docs(root, experiment)
    write_canvas(root, registry)
    return experiment


def render_canvas(registry: dict[str, Any]) -> str:
    idea_groups = {status: [] for status in ["captured", "discovering", "reviewed", "approved", "rejected", "converted"]}
    experiment_groups = {status: [] for status in ["active", "proposed", "paused", "done", "killed"]}

    for item in registry.get("ideas", []):
        idea_groups.setdefault(item.get("status", "captured"), []).append(item)
    for item in registry.get("experiments", []):
        experiment_groups.setdefault(item.get("status", "active"), []).append(item)

    lines = ["# Experiments Dashboard", "", "## Ideas", ""]
    for status in ["captured", "discovering", "reviewed", "approved", "rejected", "converted"]:
        lines.extend([
            f"### {status.replace('_', ' ').title()}",
            "| ID | Name | Owner | Updated | Review |",
            "|---|---|---|---|---|",
        ])
        items = sorted(idea_groups.get(status, []), key=lambda item: item.get("lastUpdatedAt", ""), reverse=True)
        if items:
            for item in items:
                lines.append(
                    f"| {item.get('id')} | {item.get('name')} | {item.get('owner', DEFAULT_OWNER)} | {(item.get('lastUpdatedAt') or '')[:10]} | {item.get('reviewDate') or '—'} |"
                )
        else:
            lines.append("| — | — | — | — | — |")
        lines.append("")

    lines.append("## Experiments")
    lines.append("")
    for status in ["active", "proposed", "paused", "done", "killed"]:
        lines.extend([
            f"### {status.capitalize()}",
            "| ID | Name | Owner | Last update | Next review |",
            "|---|---|---|---|---|",
        ])
        items = sorted(experiment_groups.get(status, []), key=lambda item: item.get("lastUpdateAt", ""), reverse=True)
        if items:
            for item in items:
                lines.append(
                    f"| {item.get('id')} | {item.get('name')} | {item.get('owner', DEFAULT_OWNER)} | {(item.get('lastUpdateAt') or '')[:10]} | {item.get('nextReviewAt') or '—'} |"
                )
        else:
            lines.append("| — | — | — | — | — |")
        lines.append("")

    return "\n".join(lines) + "\n"


def write_canvas(root: Path, registry: dict[str, Any]) -> None:
    write_text(canvas_path(root), render_canvas(registry))


def render_idea_reply(idea: dict[str, Any], action: str) -> str:
    labels = {
        "capture": "Captured idea",
        "discover": "Updated discovery",
        "intake": "Updated intake",
    }
    lines = [
        f"{labels[action]}: {idea['name']}",
        f"ID: {idea['id']}",
        f"Status: {idea['status']}",
        f"Idea doc: {idea['paths']['ideaDoc']}",
        f"Discovery: {idea['paths']['discoveryDoc']}",
        f"Intake: {idea['paths']['intakeDoc']}",
        "Canvas: experiments/CANVAS.md",
    ]
    if action == "intake":
        review = derive_intake_review(idea)
        lines.append(f"Recommendation: {review.get('recommendation')}")
        missing = review.get("missing") or []
        if missing:
            lines.append("Missing: " + "; ".join(missing))
    return "\n".join(lines)


def render_experiment_reply(experiment: dict[str, Any], action: str) -> str:
    verb = "Created" if action == "create" else "Updated"
    lines = [
        f"{verb} experiment: {experiment['name']}",
        f"ID: {experiment['id']}",
        f"Status: {experiment['status']}",
        f"Docs: {experiment['docsPath']}",
        f"Evals: {experiment.get('evalsPath')}",
        f"Runs: {experiment.get('runsPath')}",
        "Canvas: experiments/CANVAS.md",
    ]
    if experiment.get("nextReviewAt"):
        lines.append(f"Next review: {experiment['nextReviewAt']}")
    if experiment.get("latestSummary"):
        lines.append(f"Summary: {experiment['latestSummary']}")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", help="Project root to operate on", default=".")

    sub = parser.add_subparsers(dest="command", required=True)

    capture_cmd = sub.add_parser("capture", help="Capture a new idea")
    capture_cmd.add_argument("--text", required=True, help="Idea text block")

    discover_cmd = sub.add_parser("discover", help="Create or update discovery notes for an idea")
    discover_cmd.add_argument("--id", required=True, help="Idea id")
    discover_cmd.add_argument("--text", help="Discovery text block")

    intake_cmd = sub.add_parser("intake", help="Create or update intake notes for an idea")
    intake_cmd.add_argument("--id", required=True, help="Idea id")
    intake_cmd.add_argument("--text", help="Intake text block")

    create_cmd = sub.add_parser("create", help="Create an experiment from an idea")
    create_cmd.add_argument("--id", required=True, help="Idea id")
    create_cmd.add_argument("--force", action="store_true", help="Create even if intake is not ready")

    update_cmd = sub.add_parser("update", help="Update an experiment with a text block")
    update_cmd.add_argument("--id", required=True, help="Experiment id")
    update_cmd.add_argument("--text", required=True, help="Update text block without the first line")

    parse_cmd = sub.add_parser("parse", help="Backward-compatible Buzz create/update parser")
    parse_cmd.add_argument("--text", required=True, help="Buzz-style command text")

    sub.add_parser("canvas", help="Regenerate canvas from registry")
    sub.add_parser("show", help="Print the registry JSON")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = root_path(args.root)

    if args.command == "canvas":
        registry = load_registry(root)
        write_canvas(root, registry)
        print(canvas_path(root).relative_to(root))
        return 0

    if args.command == "show":
        print(json.dumps(load_registry(root), indent=2))
        return 0

    if args.command == "capture":
        idea = capture_idea(root, normalize_idea_capture_fields(args.text))
        print(render_idea_reply(idea, "capture"))
        return 0

    if args.command == "discover":
        fields = normalize_discovery_fields(args.text) if args.text else {}
        idea = discover_idea(root, args.id, fields)
        print(render_idea_reply(idea, "discover"))
        return 0

    if args.command == "intake":
        fields = normalize_intake_fields(args.text) if args.text else {}
        idea, _review = intake_idea(root, args.id, fields)
        print(render_idea_reply(idea, "intake"))
        return 0

    if args.command == "create":
        _idea, experiment = create_experiment_from_idea(root, args.id, force=args.force)
        print(render_experiment_reply(experiment, "create"))
        return 0

    if args.command == "update":
        fields = normalize_experiment_fields(parse_loose_block(args.text).fields)
        fields["id"] = args.id
        experiment = update_experiment(root, fields)
        print(render_experiment_reply(experiment, "update"))
        return 0

    if args.command == "parse":
        parsed = parse_command_text(args.text)
        fields = normalize_experiment_fields(parsed.fields)
        if parsed.action == "create":
            experiment = create_experiment(root, fields)
        else:
            experiment = update_experiment(root, fields)
        print(render_experiment_reply(experiment, parsed.action))
        return 0

    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
