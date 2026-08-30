import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { inspectSnapshot } from "./snapshot-validation.mjs";

// Gate between generation and publication. `scripts/sync-waves.mjs` writes the
// fallback; this refuses to let a bad one travel any further.
//
// Pass `--baseline <path>` with the wave list this run would replace — the
// committed one, `git show HEAD:app/waves-data.json` — and a collapse in the
// issue count is refused as well. Structural validity is not enough: a read
// that returns milestones and no issues produces a perfectly well-formed
// snapshot of nothing.

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown read failure";
    throw new Error(`Could not read ${path}: ${detail}`);
  }
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const waves = readJson("app/waves-data.json");
const meta = readJson("app/waves-meta.json");
const baselinePath = argument("baseline");
const baseline = baselinePath ? readJson(baselinePath) : undefined;
const report = inspectSnapshot({ waves, meta, baseline });

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
