# ADR-008: Inline Frame interview and Personal Context Scan

**Status:** Accepted  
**Date:** 2026-07-27

## Decision

Research threads use the workflow cockpit itself as the primary interaction surface.
During Frame, the user supplies a research question and the agent either asks one
material follow-up or proposes a structured frame. The proposal must be explicitly
approved before the workflow can advance.

After approval, a Personal Context Scan searches existing graph continuity, prior
threads, Agent Brain, LifeOS, and the Obsidian vault. Results are candidates, not
automatic prompt context. Each candidate carries its source and must be included or
ignored by the user. Only included candidates are written to the approved-context
artifact used by later stages.

External Mac sources are accessed through a fixed, read-only script over the existing
Tailscale SSH path. The dashboard sends only an encoded query, cannot choose an
arbitrary command or path, bounds reads and result counts, and does not copy the
whole vault into the agent prompt.

The Frame-to-Gather transition is rejected unless both an approved frame and an
accepted context scan exist. Skipping the scan records an explicit empty acceptance.

## Consequences

- The normal workflow no longer requires switching to Conversation.
- Clarification is progressive instead of presenting a long intake form.
- Personal data remains reviewable and source-attributed before it affects research.
- A scan can return partial results when a source is offline; the user may retry or
  explicitly skip.
- All secondary workflow data remains on the existing polled thread-extras path, so
  this does not consume another live shape connection.
