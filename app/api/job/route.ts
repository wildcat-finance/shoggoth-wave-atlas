import {
  eligibleJobs,
  invalidIssues,
  jobPrompt,
  jobRule,
  randomEligibleJob,
  type SelectableExecutionMode,
} from "../../job";
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
    execution_mode: issue.execution_mode,
    prompt: jobPrompt(issue),
    wave: {
      title: issue.wave.title,
      milestone_number: issue.wave.number,
      url: issue.wave.url,
    },
  };
}

export async function GET(request: Request) {
  const loaded = await loadWaves();
  const searchParams = new URL(request.url).searchParams;
  const requestedKind = searchParams.get("kind") ?? "all";
  if (!["all", "fiat", "pull_request"].includes(requestedKind)) {
    return Response.json(
      { error: "kind must be all, fiat, or pull_request" },
      { status: 400, headers },
    );
  }
  const mode = requestedKind === "all"
    ? undefined
    : requestedKind as SelectableExecutionMode;
  const allJobs = eligibleJobs(loaded.waves);
  const jobs = allJobs.filter(
    (job) => mode === undefined || job.execution_mode === mode,
  );
  const invalid = invalidIssues(loaded.waves);
  const all = searchParams.get("all") === "true";
  const selected = all ? null : randomEligibleJob(loaded.waves, mode);

  return Response.json(
    {
      schema: "wildcat-wave-job/v3",
      rule: jobRule,
      source: "https://github.com/wildcat-finance/skills/milestones",
      selection: { method: "random", kind: requestedKind },
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
      ready_counts: {
        fiat: allJobs.filter((job) => job.execution_mode === "fiat").length,
        pull_request: allJobs.filter((job) => job.execution_mode === "pull_request").length,
        invalid: invalid.filter((issue) => issue.ready).length,
      },
      invalid_issues: invalid.map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.url,
        execution_reason: issue.execution_reason,
        ready: issue.ready,
        wave: {
          title: issue.wave.title,
          milestone_number: issue.wave.number,
          url: issue.wave.url,
        },
      })),
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
