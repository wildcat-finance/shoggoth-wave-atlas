import assert from "node:assert/strict";
import test from "node:test";

import { buildAtlasIssues } from "../app/atlas-issues-transform.mjs";

function issue(number, overrides = {}) {
  return {
    number,
    title: `Atlas issue ${number}`,
    state: "open",
    updated_at: "2026-08-28T01:00:00Z",
    labels: [{ name: "enhancement" }],
    ...overrides,
  };
}

test("open Atlas issues form their own newest-first category", () => {
  const issues = buildAtlasIssues([
    issue(6),
    issue(7, { labels: ["maintenance", { name: "release" }] }),
    issue(5, { state: "closed" }),
    issue(8, { pull_request: { url: "https://api.github.com/pulls/8" } }),
  ]);

  assert.deepEqual(
    issues.map((entry) => entry.number),
    [7, 6],
  );
  assert.deepEqual(issues[0].labels, ["maintenance", "release"]);
  assert.equal(
    issues[0].url,
    "https://github.com/wildcat-finance/shoggoth-wave-atlas/issues/7",
  );
});

test("a malformed open Atlas issue refuses the category read", () => {
  assert.throws(
    () => buildAtlasIssues([issue(6, { updated_at: "not-a-date" })]),
    /malformed open Atlas issue/,
  );
  assert.throws(
    () => buildAtlasIssues([issue(6, { labels: [null] })]),
    /invalid label/,
  );
});
