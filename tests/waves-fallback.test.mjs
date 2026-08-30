import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { inspectSnapshot } from "../scripts/snapshot-validation.mjs";

// The live GitHub read is the ordinary source. This file is about the other
// path: what the Atlas says when that read is unavailable. A fallback that
// cannot report its own age and provenance is indistinguishable from a fresh
// read of a quiet backlog, so the reporting is the thing under test.

const snapshotWaves = JSON.parse(
  readFileSync(new URL("../app/waves-data.json", import.meta.url), "utf8"),
);
const snapshotMeta = JSON.parse(
  readFileSync(new URL("../app/waves-meta.json", import.meta.url), "utf8"),
);

// Every GitHub read fails for the whole of this file. node --test runs each
// test file in its own process, so this cannot leak into the suites that
// exercise the live path.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("api.github.com")) {
    throw new Error("simulated GitHub outage");
  }
  return realFetch(input, init);
};

async function request(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("the committed fallback is publishable on its own terms", () => {
  const report = inspectSnapshot({ waves: snapshotWaves, meta: snapshotMeta });
  assert.deepEqual(report.problems, []);
  assert.ok(report.waveCount > 0);
});

test("an unavailable live read answers from the committed snapshot", async () => {
  const response = await request("/api/job");
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.read_from, "snapshot");
  // The committed values, not a time or a revision invented at request time.
  assert.equal(body.generated_at, snapshotMeta.generated_at);
  assert.equal(body.source_revision, snapshotMeta.source_revision);
  assert.match(body.source_revision, /^[0-9a-f]{40}$/i);
  // The dropped inventory travels with the snapshot. An answer that omitted it
  // would report "nothing is hidden" when it means "this read cannot say".
  assert.deepEqual(body.open_issues_without_a_wave, snapshotMeta.dropped);
  // Why the live read did not answer, so a reader is not left guessing.
  assert.match(body.read_error, /simulated GitHub outage/);
  assert.equal(typeof body.credential_present, "boolean");
  assert.ok(body.eligible_count > 0);
  assert.equal(body.job.number, body.job.number | 0);
});

test("the fallback still offers the whole eligible pool", async () => {
  const response = await request("/api/job?all=true");
  const body = await response.json();

  assert.equal(body.read_from, "snapshot");
  assert.equal(body.jobs.length, body.eligible_count);
  assert.ok(
    body.jobs.every((job) =>
      job.url.startsWith("https://github.com/wildcat-finance/skills/issues/"),
    ),
  );
});

test("the page reports the snapshot's own age and revision", async () => {
  const response = await request("/");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Skills revision/);
  assert.ok(html.includes(snapshotMeta.source_revision.slice(0, 7)));
});
