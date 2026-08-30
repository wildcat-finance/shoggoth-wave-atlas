import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { inspectSnapshot } from "./snapshot-validation.mjs";

// Gate between generation and publication. `scripts/sync-waves.mjs` writes the
// fallback; this refuses to let a bad one travel any further.

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown read failure";
    throw new Error(`Could not read ${path}: ${detail}`);
  }
}

const waves = readJson("app/waves-data.json");
const meta = readJson("app/waves-meta.json");
const report = inspectSnapshot({ waves, meta });

if (!report.ok) {
  console.error("The generated fallback snapshot is not publishable:");
  for (const problem of report.problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Fallback snapshot valid: ${report.waveCount} waves, ${report.memberCount} issues, ` +
    `${report.droppedCount} open issue(s) without a wave.`,
);
console.log(`Skills revision ${meta.source_revision} observed at ${meta.generated_at}.`);
