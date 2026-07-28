#!/usr/bin/env python3
"""Read-only bounded search for dashboard Personal Context Scan."""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOTS = [
    ("obsidian", Path("/Volumes/Extra Storage Crucial 1TB SSD/Projects/Infrastructure/obsidian-vault/Vault-v2")),
    ("agent-brain", Path.home() / "agent-brain" / "Knowledge"),
    ("life-os", Path.home() / "data-projects" / "life-os"),
]
ALLOWED_SUFFIXES = {".md", ".mdx", ".txt", ".json"}
STOPWORDS = {
    "about", "after", "again", "against", "also", "and", "are", "can", "could",
    "does", "for", "from", "have", "how", "into", "its", "might", "should", "that",
    "the", "their", "this", "want", "what", "when", "where", "which", "with", "would",
    "benefit", "benefits", "daily", "evidence", "health", "research", "risk", "risks",
}


def tokens(query: str) -> list[str]:
    words = re.findall(r"[a-z0-9][a-z0-9-]{2,}", query.lower())
    return list(dict.fromkeys(word for word in words if word not in STOPWORDS))[:18]


def excerpt_for(text: str, terms: list[str]) -> tuple[str, int]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    best = ""
    best_score = 0
    for line in lines:
        lowered = line.lower()
        score = sum(1 for term in terms if re.search(rf"\b{re.escape(term)}\b", lowered))
        if score > best_score:
            best, best_score = line, score
    if not best and lines:
        best = lines[0]
    return best[:700], best_score


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: context-search.py <base64-query>")
    query = base64.urlsafe_b64decode(sys.argv[1].encode()).decode()
    terms = tokens(query)
    results: list[dict[str, object]] = []

    for source, root in ROOTS:
        if not root.exists():
            continue
        paths: list[Path] = []
        if terms:
            pattern = "|".join(rf"\b{re.escape(term)}\b" for term in terms)
            try:
                matched = subprocess.run(
                    [
                        "/opt/homebrew/bin/rg", "-i", "-l", "--hidden",
                        "--glob", "!.*/**",
                        "--glob", "*.md", "--glob", "*.mdx",
                        "--glob", "*.txt", "--glob", "*.json",
                        pattern, str(root),
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                paths = [Path(line) for line in matched.stdout.splitlines()[:120]]
            except (OSError, subprocess.TimeoutExpired):
                paths = []

        if not paths:
            scanned = 0
            for dirpath, dirnames, filenames in os.walk(root, onerror=lambda _error: None):
                dirnames[:] = [name for name in dirnames if not name.startswith(".")]
                for filename in filenames:
                    if scanned >= 12000:
                        break
                    path = Path(dirpath) / filename
                    if path.suffix.lower() not in ALLOWED_SUFFIXES:
                        continue
                    scanned += 1
                    paths.append(path)
                if scanned >= 12000:
                    break

        for path in paths:
                try:
                    relative_parts = path.relative_to(root).parts
                except ValueError:
                    relative_parts = path.parts
                if any(part.startswith(".") for part in relative_parts):
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")[:250_000]
                except (OSError, InterruptedError):
                    continue
                excerpt, body_score = excerpt_for(text, terms)
                name = path.stem.lower()
                title_score = sum(2 for term in terms if re.search(rf"\b{re.escape(term)}\b", name))
                score = body_score + title_score
                if score < 1:
                    continue
                results.append({
                    "source": source,
                    "sourceRef": str(path),
                    "excerpt": excerpt,
                    "relevance": f"Matched {score} query signal{'s' if score != 1 else ''}.",
                    "confidence": min(0.95, 0.45 + score * 0.08),
                    "sensitivity": "health" if any(x in str(path).lower() for x in ("health", "medical", "blood", "supplement")) else "personal",
                    "score": score,
                })

    results.sort(key=lambda item: (-int(item["score"]), str(item["sourceRef"])))
    print(json.dumps(results[:18]))


if __name__ == "__main__":
    main()
