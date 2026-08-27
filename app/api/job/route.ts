import { eligibleJobs, fiatPrompt, jobRule, randomEligibleJob } from "../../job";
import { buildRevision } from "../../build-info";
import { cacheSeconds, loadWaves } from "../../waves-source";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

function publicJob(issue: ReturnType<typeof eligibleJobs>[number]) {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    prompt: fiatPrompt(issue),
    wave: {
      title: issue.wave.title,
      milestone_number: issue.wave.number,
      url: issue.wave.url,
    },
  };
}

export async function GET(request: Request) {
  const loaded = await loadWaves();
  const jobs = eligibleJobs(loaded.waves);
  const all = new URL(request.url).searchParams.get("all") === "true";
  const selected = all ? null : randomEligibleJob(loaded.waves);

  return Response.json(
    {
      schema: "wildcat-wave-job/v2",
      rule: jobRule,
      source: "https://github.com/wildcat-finance/skills/milestones",
      selection: "random",
      // Read this before trusting the set. `live` and `cache` mean the waves
      // were read from GitHub, at `generated_at`; `snapshot` means that read
      // failed and the compiled fallback answered instead, so the set can be
      // arbitrarily old. Without these fields a caller cannot tell a quiet
      // backlog from a stale file.
      read_from: loaded.source,
      generated_at: loaded.generatedAt,
      source_revision: loaded.sourceRevision,
      build_revision: buildRevision,
      cache_seconds: cacheSeconds,
      ...(loaded.readError ? { read_error: loaded.readError } : {}),
      ...(loaded.credentialPresent === undefined
        ? {}
        : { credential_present: loaded.credentialPresent }),
      eligible_count: jobs.length,
      open_issues_without_a_wave: loaded.droppedWithoutWave,
      ...(all
        ? {
            jobs: jobs.map(publicJob),
          }
        : {
            job: selected ? publicJob(selected) : null,
          }),
    },
    { headers },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
