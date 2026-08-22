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
  assert.equal(body.schema, "wildcat-wave-job/v1");
  assert.equal(body.selection, "random");
  assert.ok(body.eligible_count > 20);
  assert.equal(typeof body.job.number, "number");
  assert.match(body.job.url, new RegExp(`/issues/${body.job.number}$`));
  assert.match(body.job.prompt, new RegExp(`issue #${body.job.number}`));
  assert.match(body.job.prompt, /for as little or as long as I want/);
  assert.match(body.job.prompt, /stop cleanly at any checkpoint/);
  assert.match(body.job.prompt, /very explicit whenever each checkpoint stage is reached/);
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
