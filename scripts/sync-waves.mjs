import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildWaves } from "../app/waves-transform.mjs";

const SKILLS_REPOSITORY = "wildcat-finance/skills";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 15_000;

// Read Skills over plain HTTP, the same way app/waves-source.ts does, rather
// than by shelling out to `gh`.
//
// This is not a style preference. A GitHub Actions `GITHUB_TOKEN` is an
// installation credential scoped to the repository running the workflow, and
// handing it to this read returned fourteen milestones and *zero issues* from
// wildcat-finance/skills — a successful-looking response describing nothing.
// An unauthenticated read of the same two endpoints, from the same runner in
// the same minute, returned the whole backlog. So the credential narrowed the
// answer instead of widening it, and the safe default for a public repository
// is to send none at all.
//
// SKILLS_READ_TOKEN exists for rate-limit relief and must be a credential that
// can actually see Skills. It is deliberately not named GITHUB_TOKEN: that way
// a workflow cannot pass one in by accident and quietly shrink the read.
const token = process.env.SKILLS_READ_TOKEN;

async function githubPages(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "shoggoth-wave-atlas-sync",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const collected = [];
  // Pages are requested by number rather than by following Link headers.
  // GitHub returns those as `repositories/{id}/...`, which some proxies refuse,
  // and the live reader walks pages the same way. One strategy, no dependency
  // on a header being passed through untouched.
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url =
      `https://api.github.com/repos/${SKILLS_REPOSITORY}/${path}` +
      `?state=all&per_page=${PAGE_SIZE}&page=${page}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const limit = response.headers.get("x-ratelimit-limit") ?? "unknown";
      const remaining = response.headers.get("x-ratelimit-remaining") ?? "unknown";
      throw new Error(
        `GitHub ${path} page ${page} returned ${response.status} ` +
          `(hourly limit ${limit}, remaining ${remaining}, ` +
          `credential ${token ? "sent" : "absent"})`,
      );
    }
    const body = await response.json();
    if (!Array.isArray(body)) {
      throw new Error(`GitHub ${path} page ${page} was not an array`);
    }
    collected.push(...body);
    if (body.length < PAGE_SIZE) return collected;
  }
  throw new Error(`GitHub ${path} exceeded ${MAX_PAGES} pages`);
}

async function sourceRevisionOf() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "shoggoth-wave-atlas-sync",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `https://api.github.com/repos/${SKILLS_REPOSITORY}/commits/main`,
    { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw new Error(`GitHub commits/main returned ${response.status}`);
  }
  const body = await response.json();
  if (typeof body.sha !== "string" || !/^[0-9a-f]{40}$/i.test(body.sha)) {
    throw new Error("GitHub did not return a full Skills source revision");
  }
  return body.sha;
}

const milestones = await githubPages("milestones");
const issues = await githubPages("issues");
const sourceRevision = await sourceRevisionOf();

// An empty read is a failed read wearing data's clothes. Skills always has
// milestones and always has issues, so zero of either means the read did not
// see the repository — a narrowed credential, a truncated page, a proxy
// answering for GitHub. Refuse before anything is written: a snapshot with
// waves and no issues passes every structural check and silently becomes an
// Atlas that offers nothing.
if (milestones.length === 0) {
  throw new Error("GitHub returned no milestones for Skills; refusing to write a snapshot");
}
if (issues.length === 0) {
  throw new Error("GitHub returned no issues for Skills; refusing to write a snapshot");
}

const { waves, dropped } = buildWaves({ milestones, issues });
const memberCount = waves.flatMap((wave) => wave.members).length;
if (memberCount === 0) {
  throw new Error(
    `Read ${issues.length} issue(s) but none landed in a wave; refusing to write a snapshot`,
  );
}
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
  `${JSON.stringify({ generated_at: generatedAt, source_revision: sourceRevision, dropped }, null, 2)}\n`,
);

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
