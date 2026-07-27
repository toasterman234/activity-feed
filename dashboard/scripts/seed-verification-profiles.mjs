import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const profiles = [
  {
    repoName: "activity-feed",
    workingDirectory: "dashboard",
    commands: [
      {
        key: "shape-budget",
        label: "Electric shape budget",
        command: "npm run check:shapes",
        required: true,
      },
      {
        key: "pipeline-contracts",
        label: "Pipeline contract tests",
        command:
          "node --test --experimental-strip-types src/lib/work-run-contract.test.ts src/lib/verification-profiles.test.ts",
        required: true,
      },
    ],
  },
  {
    repoName: "graph-continuity-b-c-d",
    workingDirectory: null,
    commands: [
      {
        key: "git-diff-check",
        label: "Patch integrity",
        command: "git diff --check",
        required: true,
      },
    ],
  },
];

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  for (const profile of profiles) {
    const repo = await client.query(`SELECT id FROM repos WHERE name = $1 ORDER BY created_at LIMIT 1`, [
      profile.repoName,
    ]);
    if (!repo.rows[0]) {
      console.warn(`repository not registered; skipped ${profile.repoName}`);
      continue;
    }
    const result = await client.query(
      `INSERT INTO repo_verification_profiles (
         repo_id, working_directory, commands, timeout_ms, max_feedback_cycles, enabled
       ) VALUES ($1, $2, $3::jsonb, 120000, 2, true)
       ON CONFLICT (repo_id) DO NOTHING
       RETURNING repo_id`,
      [repo.rows[0].id, profile.workingDirectory, JSON.stringify(profile.commands)],
    );
    console.log(`${result.rows[0] ? "seeded" : "kept existing"} ${profile.repoName}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
