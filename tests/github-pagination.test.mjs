import assert from "node:assert/strict";
import test from "node:test";

import { githubPageUrl, nextGithubCursor } from "../app/github-pagination.mjs";

test("the next-page cursor stays on the public repository path", () => {
  const link =
    '<https://api.github.com/repositories/1334819508/issues?state=all&per_page=100&after=cursor-2&page=2>; rel="next", ' +
    '<https://api.github.com/repositories/1334819508/issues?state=all&per_page=100&before=cursor-1&page=1>; rel="prev"';

  const url = new URL(
    githubPageUrl({
      repository: "wildcat-finance/skills",
      path: "issues",
      state: "all",
      pageSize: 100,
      after: nextGithubCursor(link),
    }),
  );

  assert.equal(url.pathname, "/repos/wildcat-finance/skills/issues");
  assert.equal(url.searchParams.get("after"), "cursor-2");
  assert.equal(url.searchParams.has("page"), false);
});

test("the last page has no next cursor", () => {
  assert.equal(
    nextGithubCursor(
      '<https://api.github.com/repositories/1/issues?before=cursor-1&page=1>; rel="prev"',
    ),
    undefined,
  );
  assert.equal(nextGithubCursor(null), undefined);
});

test("a next link without a cursor is refused", () => {
  assert.throws(
    () =>
      nextGithubCursor(
        '<https://api.github.com/repositories/1/issues?state=all&page=2>; rel="next"',
      ),
    /did not contain an after cursor/,
  );
});
