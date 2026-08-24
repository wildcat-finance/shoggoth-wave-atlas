import assert from "node:assert/strict";
import test from "node:test";

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

test("server-renders the Shoggoth Wave Atlas", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Shoggoth Wave Atlas · Wildcat Skills<\/title>/i);
  assert.doesNotMatch(html, /codex-preview/);
});

test("job API returns the selected issue and the complete contribution prompt", async () => {
  const response = await request("/api/job");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");

  const body = await response.json();
  assert.equal(body.schema, "wildcat-wave-job/v2");
  assert.ok(["live", "cache", "snapshot"].includes(body.read_from));
  assert.ok(Number.isFinite(Date.parse(body.generated_at)));
  assert.equal(body.cache_seconds, 600);
  assert.ok(Array.isArray(body.open_issues_without_a_wave));
  assert.equal(body.selection, "random");
  assert.ok(body.eligible_count > 20);
  assert.equal(typeof body.job.number, "number");
  assert.match(body.job.url, new RegExp(`/issues/${body.job.number}$`));
  assert.match(body.job.prompt, new RegExp(`issue #${body.job.number}`));
  assert.match(body.job.prompt, /I am an external contributor, not the Shoggoth/);
  assert.match(body.job.prompt, /use my own valid signing identity/);
  assert.match(body.job.prompt, /publish through my GitHub account/);
  assert.match(body.job.prompt, /Never ask me for or configure the Shoggoth signing key or GitHub account/);
  assert.match(body.job.prompt, /Fiat does not yet support checkpointing/);
  assert.match(body.job.prompt, /Work is actively ongoing to complete it/);
  assert.doesNotMatch(body.job.prompt, /pull\/479|issues\/479|#479/);
  assert.match(body.job.prompt, /Before hexctl init/);
  assert.match(body.job.prompt, /stop before init/);
  assert.match(body.job.prompt, /Do not start the run here or request or transfer Shoggoth credentials/);
  assert.match(body.job.prompt, /finish the same run in the same environment/);
  assert.match(body.job.prompt, /unfinished run can lose the work/);
  assert.match(body.job.prompt, /carry the complete Fiat workflow through rather than only telling me/);
  assert.match(body.job.prompt, /Do not assume another contributor or session can resume an incomplete run/);
  assert.ok(
    body.job.prompt.indexOf(`issue #${body.job.number}`) <
      body.job.prompt.indexOf("Fiat does not yet support checkpointing"),
  );
  assert.ok(
    body.job.prompt.indexOf("Fiat does not yet support checkpointing") <
      body.job.prompt.indexOf("Before hexctl init"),
  );
  assert.doesNotMatch(body.job.prompt, /for as little or as long as I want/);
  assert.doesNotMatch(body.job.prompt, /stop cleanly at any checkpoint/);
  assert.doesNotMatch(body.job.prompt, /tell me exactly what I need to do/);
});

test("complete job pool spans every dependency-clear wave", async () => {
  const response = await request("/api/job?all=true");
  const body = await response.json();

  assert.equal(body.jobs.length, body.eligible_count);
  assert.ok(new Set(body.jobs.map((job) => job.wave.milestone_number)).size > 10);
  assert.ok(body.jobs.every((job) => job.prompt.includes(`issue #${job.number}`)));
});

for (const [provider, expectedOrigin] of [
  ["chatgpt", "https://chatgpt.com"],
  ["claude", "https://claude.ai"],
]) {
  test(`${provider} redirect carries the API-selected issue and prompt`, async () => {
    const apiResponse = await request("/api/job?all=true");
    const { jobs } = await apiResponse.json();
    const response = await request(`/go/${provider}`);

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const destination = new URL(response.headers.get("location"));
    assert.equal(destination.origin, expectedOrigin);
    assert.ok(jobs.some((job) => job.prompt === destination.searchParams.get("q")));
  });
}
