import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildWaves } from "../app/waves-transform.mjs";

function gh(path, fields = []) {
  const args = ["api", "--paginate", "--slurp", path, "--method", "GET"];
  for (const [name, value] of fields) args.push("-f", `${name}=${value}`);
  const output = execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(output).flat();
}

const milestones = gh("repos/wildcat-finance/skills/milestones", [
  ["state", "all"],
  ["per_page", "100"],
]);
const issues = gh("repos/wildcat-finance/skills/issues", [
  ["state", "all"],
  ["per_page", "100"],
]);

const { waves, dropped } = buildWaves({ milestones, issues });
const generatedAt = new Date().toISOString();

writeFileSync(
  resolve("app/waves-data.json"),
  `${JSON.stringify(waves, null, 2)}\n`,
);
writeFileSync(
  resolve("app/waves-meta.json"),
  `${JSON.stringify({ generated_at: generatedAt }, null, 2)}\n`,
);

const memberCount = waves.flatMap((wave) => wave.members).length;
console.log(`Captured ${waves.length} waves and ${memberCount} issues at ${generatedAt}.`);

// An open issue with no milestone is invisible to the Atlas. That is the rule,
// because a wave is a milestone, but it used to be a silent rule: issues sat
// open and unreachable with nothing reporting it. Say so here, every run.
if (dropped.length === 0) {
  console.log("Every open issue carries a wave.");
} else {
  console.log(
    `\n${dropped.length} open issue(s) carry no wave and cannot be offered:`,
  );
  for (const issue of dropped) {
    console.log(`  #${issue.number} ${issue.title}`);
  }
  console.log("\nGive each one a milestone, or accept that the Atlas will not offer it.");
}
