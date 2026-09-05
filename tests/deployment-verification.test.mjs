import assert from "node:assert/strict";
import test from "node:test";

import {
  FETCH_TIMEOUT_MS,
  inspectDeployment,
  readDeployment,
  resolveEndpoint,
  resolveExpectedRevision,
} from "../scripts/deployment-verification.mjs";

const REVISION = "08da9b31e6455a0301e27aca5eb94e235b3d961a";
const OTHER_REVISION = "e5131e9aeadf6750c6201d4ba4babaf62eb9f76b";

function healthy(overrides = {}) {
  return {
    schema: "wildcat-wave-job/v3",
    read_from: "cache",
    generated_at: "2026-08-28T01:04:37.050Z",
    source_revision: OTHER_REVISION,
    build_revision: REVISION,
    ...overrides,
  };
}

test("a matching deployment passes", () => {
  assert.deepEqual(inspectDeployment(healthy(), REVISION), { ok: true, problems: [] });
});

test("every recognised read mode passes", () => {
  for (const read_from of ["live", "cache", "snapshot"]) {
    assert.equal(inspectDeployment(healthy({ read_from }), REVISION).ok, true, read_from);
  }
});

test("a wrong expected revision fails", () => {
  const { ok, problems } = inspectDeployment(healthy(), OTHER_REVISION);
  assert.equal(ok, false);
  assert.ok(problems.some((problem) => problem.includes(`expected ${OTHER_REVISION}`)));
});

test("a response older than build_revision fails", () => {
  const payload = healthy();
  delete payload.build_revision;
  const { ok, problems } = inspectDeployment(payload, REVISION);
  assert.equal(ok, false);
  assert.ok(problems.some((problem) => /valid build_revision/.test(problem)));
});

test("a truncated or absent source_revision fails", () => {
  for (const source_revision of ["08da9b3", "", undefined, 12]) {
    const { ok, problems } = inspectDeployment(healthy({ source_revision }), REVISION);
    assert.equal(ok, false, `accepted ${String(source_revision)}`);
    assert.ok(problems.some((problem) => /source_revision/.test(problem)));
  }
});

test("an unrecognised read_from fails", () => {
  for (const read_from of ["stale", "", undefined]) {
    const { ok, problems } = inspectDeployment(healthy({ read_from }), REVISION);
    assert.equal(ok, false, `accepted ${String(read_from)}`);
    assert.ok(problems.some((problem) => /read_from/.test(problem)));
  }
});

test("both failures are reported from one read", () => {
  const { problems } = inspectDeployment(
    healthy({ build_revision: OTHER_REVISION, read_from: "stale" }),
    REVISION,
  );
  assert.equal(problems.length, 2);
});

test("a non-object payload fails without throwing", () => {
  assert.equal(inspectDeployment(null, REVISION).ok, false);
  assert.equal(inspectDeployment("nope", REVISION).ok, false);
});

test("the endpoint must be https and carries the whole pool", () => {
  const endpoint = resolveEndpoint("https://atlas.example");
  assert.equal(endpoint.href, "https://atlas.example/api/job?all=true");
  assert.throws(() => resolveEndpoint("http://atlas.example"), /https/);
  assert.throws(() => resolveEndpoint(undefined), /DEPLOY_URL/);
});

test("the expected revision must be a full SHA", () => {
  assert.equal(resolveExpectedRevision(REVISION), REVISION);
  for (const value of [undefined, "", "main", "08da9b3"]) {
    assert.throws(() => resolveExpectedRevision(value), /EXPECTED_BUILD_REVISION/);
  }
});

test("the read refuses redirects and bounds its wait", async () => {
  let observed;
  await readDeployment("https://atlas.example/api/job?all=true", async (_url, init) => {
    observed = init;
    return { ok: true, json: async () => healthy() };
  });
  assert.equal(observed.redirect, "error");
  assert.ok(observed.signal instanceof AbortSignal);
  assert.equal(FETCH_TIMEOUT_MS, 15_000);
});

test("a non-200 answer is a failure, not an empty payload", async () => {
  await assert.rejects(
    readDeployment("https://atlas.example/api/job?all=true", async () => ({
      ok: false,
      status: 503,
    })),
    /returned 503/,
  );
});

test("a network failure names the endpoint", async () => {
  await assert.rejects(
    readDeployment("https://atlas.example/api/job?all=true", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }),
    /Could not fetch deployment at https:\/\/atlas.example/,
  );
});
