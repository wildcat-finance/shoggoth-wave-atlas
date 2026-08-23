import assert from "node:assert/strict";
import test from "node:test";

import { buildWaves } from "../app/waves-transform.mjs";

const milestone = {
  number: 1,
  title: "Wave 0β — controller safety",
  description: "#10 (97): first. #11 (91): second.",
  state: "open",
  open_issues: 2,
  closed_issues: 0,
  html_url: "https://github.com/wildcat-finance/skills/milestone/1",
};

function issue(number, overrides = {}) {
  return {
    number,
    title: `skill-${number} — a job`,
    state: "open",
    body: "",
    html_url: `https://github.com/wildcat-finance/skills/issues/${number}`,
    milestone,
    ...overrides,
  };
}

test("a wave carries its members in milestone-description order", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [issue(11), issue(10)],
  });

  assert.equal(waves.length, 1);
  assert.deepEqual(
    waves[0].members.map((member) => member.number),
    [10, 11],
  );
  assert.equal(waves[0].members[0].score, 97);
  assert.equal(waves[0].members[1].score, 91);
});

test("a pull request is never a wave member", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [issue(10), issue(12, { pull_request: { url: "x" } })],
  });

  assert.deepEqual(
    waves[0].members.map((member) => member.number),
    [10],
  );
});

test("depends on is read by number and by backticked skill key", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [
      issue(10, { body: "This depends on #11 and `skill-13`." }),
      issue(11, { state: "closed" }),
      issue(13, { title: "skill-13 — the other job", state: "open" }),
    ],
  });

  const member = waves[0].members.find((entry) => entry.number === 10);
  assert.deepEqual(
    member.dependencies.map((dependency) => [dependency.number, dependency.state]),
    [
      [11, "closed"],
      [13, "open"],
    ],
  );
});

test("blocks on one issue becomes a dependency on the other", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [issue(10, { body: "This blocks #11." }), issue(11)],
  });

  const blocked = waves[0].members.find((entry) => entry.number === 11);
  assert.deepEqual(
    blocked.dependencies.map((dependency) => dependency.number),
    [10],
  );
});

test("an ordered chain depends only on its immediate predecessor", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [
      issue(10, { body: "Ordered chain: #10 -> #11 -> #13" }),
      issue(11, { body: "Ordered chain: #10 -> #11 -> #13" }),
      issue(13, { body: "Ordered chain: #10 -> #11 -> #13" }),
    ],
  });

  const numbers = (target) =>
    waves[0].members
      .find((entry) => entry.number === target)
      .dependencies.map((dependency) => dependency.number);

  assert.deepEqual(numbers(10), []);
  assert.deepEqual(numbers(11), [10]);
  assert.deepEqual(numbers(13), [11]);
});

test("an issue never depends on itself", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [issue(10, { body: "This depends on #10 and #11." }), issue(11)],
  });

  assert.deepEqual(
    waves[0].members
      .find((entry) => entry.number === 10)
      .dependencies.map((dependency) => dependency.number),
    [11],
  );
});

test("a dependency outside the read set is reported as unknown", () => {
  const { waves } = buildWaves({
    milestones: [milestone],
    issues: [issue(10, { body: "This depends on #999." })],
  });

  const [dependency] = waves[0].members[0].dependencies;
  assert.equal(dependency.number, 999);
  assert.equal(dependency.state, "unknown");
  assert.equal(dependency.title, "Unknown issue");
});

test("an open issue with no wave is reported rather than dropped in silence", () => {
  const { waves, dropped } = buildWaves({
    milestones: [milestone],
    issues: [
      issue(10),
      issue(20, { milestone: null }),
      issue(21, { milestone: null, state: "closed" }),
      issue(22, { milestone: undefined }),
    ],
  });

  assert.deepEqual(
    waves[0].members.map((member) => member.number),
    [10],
  );
  assert.deepEqual(
    dropped.map((entry) => entry.number),
    [20, 22],
  );
  assert.equal(dropped[0].url, "https://github.com/wildcat-finance/skills/issues/20");
});

test("a milestone that is not a wave is ignored", () => {
  const other = { ...milestone, number: 2, title: "Backlog", description: "" };
  const { waves } = buildWaves({
    milestones: [milestone, other],
    issues: [issue(10), issue(30, { milestone: other })],
  });

  assert.deepEqual(
    waves.map((wave) => wave.title),
    ["Wave 0β — controller safety"],
  );
});
