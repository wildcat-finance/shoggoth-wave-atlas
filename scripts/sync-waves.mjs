import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildWaves } from "../app/waves-transform.mjs";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

// Pages are requested by number rather than by following Link headers. GitHub
// returns those as `repositories/{id}/...`, which some proxies refuse, and the
// live reader in app/waves-source.ts already walks pages the same way. One
// strategy, no dependency on a header being passed through untouched.
function gh(path) {
  const collected = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const output = execFileSync(
      "gh",
      ["api", "--method", "GET", `${path}?state=all&per_page=${PAGE_SIZE}&page=${page}`],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    const body = JSON.parse(output);
    if (!Array.isArray(body)) {
      throw new Error(`${path} page ${page} was not an array`);
    }
    collected.push(...body);
    if (body.length < PAGE_SIZE) return collected;
  }
  throw new Error(`${path} exceeded ${MAX_PAGES} pages`);
}

const milestones = gh("repos/wildcat-finance/skills/milestones");
const issues = gh("repos/wildcat-finance/skills/issues");

const { waves, dropped } = buildWaves({ milestones, issues });
const generatedAt = new Date().toISOString();

writeFileSync(
  resolve("app/waves-data.json"),
  `${JSON.stringify(waves, null, 2)}\n`,
);
// The dropped list travels with the snapshot. Otherwise a fallback answer
// reports an empty list, which reads as "nothing is hidden" when it means
// "this read cannot say".
writeFileSync(
  resolve("app/waves-meta.json"),
  `${JSON.stringify({ generated_at: generatedAt, dropped }, null, 2)}\n`,
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
