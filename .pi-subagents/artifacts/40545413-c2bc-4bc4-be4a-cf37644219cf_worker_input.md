# Task for worker

Audit the planning thread detail page for accepted state gaps.

Files to examine:
- /Users/bencharney/activity-feed/dashboard/src/app/channels/[channelId]/[threadId]/page.tsx
- /Users/bencharney/activity-feed/dashboard/src/app/channels/GuideBar.tsx
- /Users/bencharney/activity-feed/dashboard/src/app/channels/ThreadOverviewTab.tsx

Check:
1. Does the GuideBar terminal state for planning/accepted show the correct message and scroll button? (we just changed this, verify it's correct)
2. Does the default tab switching work correctly for all states? Check the useEffect at the tab-defaulting logic.
3. Does the ThreadOverviewTab render anything useful for the accepted state? Or is it empty?
4. Are there any other states (research accepted, issue resolved) that have similar gaps where terminal workspaces don't render?
5. Does the DoNowBanner show anything for accepted planning threads? Should it?

For each gap, cite the specific file and line number. Output a concise list of findings with file:line citations.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```