// Research styles for the `research` lifecycle. Ported from
// ax-brain-crew/src/research/modes.ts — derived from Ben's actual research
// patterns across vault projects + 200+ agentmemory sessions.
//
// A "style" changes the per-phase instructions folded into the agent prompt.
// Same research state machine (drafted → searching → synthesizing → review),
// different approach. The style is stored per-thread in thread_meta.research_mode.
//
// Phase → research-lifecycle state mapping:
//   frame      → drafted / searching (framing before/at the start of a search)
//   gather     → searching
//   synthesize → synthesizing
//   verify     → review

export interface ResearchMode {
  id: string;
  label: string;
  description: string;
  hints: { frame: string; gather: string; synthesize: string; verify: string };
}

export const RESEARCH_MODES: Record<string, ResearchMode> = {
  "first-principles": {
    id: "first-principles",
    label: "First Principles",
    description: "Break claims down to axioms, build up from fundamentals.",
    hints: {
      frame:
        'First Principles mode: before accepting any claim, ask "what assumptions is this built on?" ' +
        "Identify 3-5 axioms the argument depends on. State the question in terms of what is " +
        "actually true, not what is commonly believed. Strip away analogy, convention, and " +
        "received wisdom. What remains? Frame the investigation around those fundamentals.",
      gather:
        "Gather primary sources and foundational material, not conclusions drawn by others. " +
        "Seek the raw evidence, data, or original arguments. Avoid synthesis pieces, summaries, " +
        'and "what experts think." Look for the building blocks: definitions, experiments, ' +
        "original formulations, counterexamples.",
      synthesize:
        "Build up from the axioms you identified. For each claim, trace the chain from axiom " +
        "to conclusion. Flag any leap that is not fully supported. Where evidence is thin, say so. " +
        "Where a conventional view rests on an unexamined assumption, call it out. " +
        "Confidence tags: [HIGH] only when the chain from axiom to conclusion is complete.",
      verify:
        'Every axiom must be cited to a primary source. Every "this implies that" step must ' +
        'withstand "does it necessarily follow?" Check for hidden assumptions in each conclusion. ' +
        "If a claim cannot be reduced to fundamentals, mark it [CONFLICT] or downgrade confidence.",
    },
  },

  "adversarial-review": {
    id: "adversarial-review",
    label: "Adversarial Review",
    description: "Actively look for flaws, contradictions, and counterexamples.",
    hints: {
      frame:
        "Adversarial Review mode: state the exact claim or output being reviewed. Define what would " +
        "DISPROVE it — what evidence or counterexample would it fail? Set the bar: are we checking " +
        "for fatal flaws, or just scoring confidence? If reviewing agent output, state what the " +
        "agent was asked to do and what it actually produced.",
      gather:
        "Actively seek contradictory sources. Look for counterexamples, opposing viewpoints, " +
        "alternative explanations, and edge cases the claim did not consider. If the claim is " +
        "quantitative, gather competing data. If qualitative, gather experts who disagree. " +
        "Do not just collect evidence that supports the claim.",
      synthesize:
        "Score every component of the claim independently. Highlight the weakest points — " +
        "where evidence is missing, reasoning is flawed, or alternatives are stronger. " +
        "Structure as: what holds up, what doesn't, what's uncertain, and what's wrong. " +
        "Confidence tags: use [LOW] liberally; save [HIGH] for ironclad points.",
      verify:
        'Every counterexample must be real and checkable. Every "this is wrong" must cite ' +
        "specific evidence or reasoning. If the claim is agent output, verify tools were called " +
        "correctly, files read/written were appropriate, and the output matches the request. " +
        "If nothing is wrong, say so — adversarial review is honest, not performative.",
    },
  },

  "knowledge-base": {
    id: "knowledge-base",
    label: "Knowledge Base",
    description: "Structured collection → MOC + concept notes with confidence tags.",
    hints: {
      frame:
        "Knowledge Base mode: define the domain and the spine (organizing principle). What " +
        "angle makes this collection useful? What's the scope boundary — what is IN and what " +
        "is NOT? Name the structure: what concept notes will exist, and how they relate.",
      gather:
        "Cast a broad net across primary and secondary sources. For each concept note slot, " +
        "collect multiple sources. Prioritize original works (books, papers, lectures) over " +
        "summaries. Note where multiple credible sources converge and where they diverge. " +
        "Save everything with source citations.",
      synthesize:
        "Write one map-of-content note + one concept note per topic. Each note: a short " +
        '"For future readers" section and confidence-tagged claims ([HIGH]/[MED]/[LOW]/[CONFLICT]). ' +
        "Resolve every internal link. Structure it so a later reader can navigate top-down.",
      verify:
        "Every concept note must have a clear summary and resolved links. Every cited source " +
        "must be real and accessible. Every confidence tag must be justified by source quality " +
        "or convergence. The index must link to every concept note and back.",
    },
  },

  diagnostic: {
    id: "diagnostic",
    label: "Diagnostic",
    description: "Trace a symptom to its root cause.",
    hints: {
      frame:
        "Diagnostic mode: define the symptom precisely — what is happening that should not? " +
        "Define the system boundary — what components are involved? What is the \"normal\" state " +
        "that this diverges from? When did it start? What changed around that time?",
      gather:
        "Collect logs, traces, error messages, timestamps, and any observable evidence. " +
        "Compare working vs. failing states. Identify what changed: code, config, data, " +
        "dependencies, environment. If possible, reproduce the failure. If not, gather " +
        "every available signal.",
      synthesize:
        "Build a failure chain: symptom → immediate cause → underlying condition → root cause. " +
        "Each link in the chain must be supported by evidence. Propose the fix that addresses " +
        "the ROOT cause, not just the symptom. If multiple causes exist, rank them. " +
        "If a cause is speculative, label it as such.",
      verify:
        "Confirm every link in the failure chain with evidence. Propose a durable guard, not " +
        "just a one-time fix. If the fix is applied, verify it would have prevented the original " +
        "failure (counterfactual test).",
    },
  },
};

export const DEFAULT_RESEARCH_MODE = "first-principles";

/** Which mode hint applies at a given research-lifecycle state. */
export function researchHintForState(modeId: string, state: string): string | null {
  const mode = RESEARCH_MODES[String(modeId ?? "").trim().toLowerCase()];
  if (!mode) return null;
  switch (state) {
    case "drafted":
      return mode.hints.frame;
    case "searching":
      return mode.hints.gather;
    case "synthesizing":
      return mode.hints.synthesize;
    case "review":
      return mode.hints.verify;
    default:
      return null;
  }
}
