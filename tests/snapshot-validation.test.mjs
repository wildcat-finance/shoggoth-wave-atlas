import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectSnapshot } from "../scripts/snapshot-validation.mjs";

const waves = JSON.parse(
  readFileSync(new URL("../app/waves-data.json", import.meta.url), "utf8"),
);
const meta = JSON.parse(
  readFileSync(new URL("../app/waves-meta.json", import.meta.url), "utf8"),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the committed pair passes", () => {
  const report = inspectSnapshot({ waves, meta });
  assert.equal(report.ok, true);
  assert.deepEqual(report.problems, []);
  assert.equal(report.waveCount, waves.length);
  assert.equal(
    report.memberCount,
    waves.reduce((total, wave) => total + wave.members.length, 0),
  );
  assert.equal(report.droppedCount, meta.dropped.length);
});

test("an empty wave set is refused", () => {
  const report = inspectSnapshot({ waves: [], meta });
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((problem) => /no waves/.test(problem)));
});

test("a short or absent source revision is refused", () => {
  for (const source_revision of ["", "0d4403e", "not-a-sha", undefined]) {
    const report = inspectSnapshot({ waves, meta: { ...meta, source_revision } });
    assert.equal(report.ok, false, `accepted ${String(source_revision)}`);
    assert.ok(report.problems.some((problem) => /source_revision/.test(problem)));
  }
});

test("an unparseable generated_at is refused", () => {
  const report = inspectSnapshot({ waves, meta: { ...meta, generated_at: "whenever" } });
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((problem) => /generated_at/.test(problem)));
});

test("a missing dropped array is refused, an empty one is not", () => {
  const withoutDropped = { ...meta };
  delete withoutDropped.dropped;
  const absent = inspectSnapshot({ waves, meta: withoutDropped });
  assert.equal(absent.ok, false);
  assert.ok(absent.problems.some((problem) => /dropped/.test(problem)));

  assert.equal(inspectSnapshot({ waves, meta: { ...meta, dropped: [] } }).ok, true);
});

test("a malformed dropped entry is refused", () => {
  const report = inspectSnapshot({
    waves,
    meta: { ...meta, dropped: [{ number: 7, title: "no url" }] },
  });
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((problem) => /dropped\[0\]\.url/.test(problem)));
});

test("a wave that lost its members array is refused", () => {
  const damaged = clone(waves);
  delete damaged[0].members;
  const report = inspectSnapshot({ waves: damaged, meta });
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((problem) => /waves\[0\]\.members/.test(problem)));
});

test("a member with a broken dependency is refused, and every problem is reported", () => {
  // A hand-built fixture, not the committed snapshot. What Skills happens to
  // record today is not this validator's business, and a unit test that reads
  // live data fails for reasons that have nothing to do with the unit.
  const damaged = [
    {
      number: 1,
      title: "Wave 1",
      description: "",
      state: "open",
      open: 1,
      closed: 0,
      url: "https://github.com/wildcat-finance/skills/milestone/1",
      members: [
        {
          number: 7,
          title: 12,
          state: "open",
          url: "https://github.com/wildcat-finance/skills/issues/7",
          score: null,
          execution_mode: "fiat",
          dependencies: [
            {
              number: 6,
              title: "Earlier",
              state: "maybe",
              url: "https://github.com/wildcat-finance/skills/issues/6",
            },
          ],
        },
      ],
    },
  ];

  const report = inspectSnapshot({ waves: damaged, meta });
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((problem) => /\.state is not open, closed, or unknown/.test(problem)));
  assert.ok(report.problems.some((problem) => /\.title is not a string/.test(problem)));
});

test("waves carrying no issues at all are refused", () => {
  // The failure this check was added for: a read that returned milestones and
  // no issues produced a structurally perfect snapshot of nothing, and every
  // other check here passed it.
  const hollow = waves.map((wave) => ({ ...wave, members: [] }));
  const report = inspectSnapshot({ waves: hollow, meta });
  assert.equal(report.ok, false);
  assert.equal(report.waveCount, waves.length);
  assert.equal(report.memberCount, 0);
  assert.ok(report.problems.some((problem) => /no issues at all/.test(problem)));
});

test("a collapse against the baseline is refused, ordinary movement is not", () => {
  const trimmed = (keep) =>
    waves.map((wave) => ({ ...wave, members: wave.members.slice(0, keep) }));

  // Losing most of the backlog between two runs is a bad read, not a quiet week.
  const collapsed = inspectSnapshot({ waves: trimmed(1), meta, baseline: waves });
  assert.equal(collapsed.ok, false);
  assert.ok(collapsed.problems.some((problem) => /would fall from/.test(problem)));

  // The same data with no baseline to compare against is structurally fine.
  assert.equal(inspectSnapshot({ waves: trimmed(1), meta }).ok, true);
  // And an unchanged snapshot is never a collapse.
  assert.equal(inspectSnapshot({ waves, meta, baseline: waves }).ok, true);
});

// The scripts the refresh workflow runs, exercised the way the workflow runs
// them: as processes with an exit code. A validation failure has to stop the
// run before anything reaches GitHub, so both of these are checked against a
// deliberately broken snapshot in a scratch tree.

function brokenTree() {
  const root = mkdtempSync(join(tmpdir(), "atlas-snapshot-"));
  mkdirSync(join(root, "app"));
  writeFileSync(join(root, "app/waves-data.json"), "[]\n");
  writeFileSync(
    join(root, "app/waves-meta.json"),
    JSON.stringify({ generated_at: "whenever", source_revision: "short" }) + "\n",
  );
  return root;
}

function run(script, cwd, env = {}) {
  try {
    execFileSync(process.execPath, [new URL(`../scripts/${script}`, import.meta.url).pathname], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stderr: "" };
  } catch (error) {
    return { code: error.status ?? 1, stderr: String(error.stderr ?? "") };
  }
}

test("the validator exits non-zero and names every problem", () => {
  const { code, stderr } = run("validate-waves-snapshot.mjs", brokenTree());
  assert.equal(code, 1);
  assert.match(stderr, /not publishable/);
  assert.match(stderr, /no waves/);
  assert.match(stderr, /source_revision/);
  assert.match(stderr, /generated_at/);
  assert.match(stderr, /dropped/);
});

test("the publisher refuses an invalid snapshot before it touches GitHub", () => {
  const { code, stderr } = run("publish-fallback-refresh.mjs", brokenTree(), {
    GITHUB_TOKEN: "not-a-real-token",
    GH_TOKEN: "not-a-real-token",
    GITHUB_REPOSITORY: "wildcat-finance/shoggoth-wave-atlas",
  });
  assert.equal(code, 1);
  assert.match(stderr, /Refusing to publish an invalid fallback snapshot/);
  // Nothing was attempted against the API, so no status or ref appears here.
  assert.doesNotMatch(stderr, /returned \d{3}/);
});

test("the validator accepts the committed tree", () => {
  const { code } = run("validate-waves-snapshot.mjs", new URL("..", import.meta.url).pathname);
  assert.equal(code, 0);
});
