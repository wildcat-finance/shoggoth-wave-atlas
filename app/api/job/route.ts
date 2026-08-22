import { eligibleJobs, fiatPrompt, jobRule, randomEligibleJob } from "../../job";

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

export function GET(request: Request) {
  const jobs = eligibleJobs();
  const all = new URL(request.url).searchParams.get("all") === "true";
  const selected = all ? null : randomEligibleJob();

  return Response.json(
    {
      schema: "wildcat-wave-job/v1",
      rule: jobRule,
      source: "https://github.com/wildcat-finance/skills/milestones",
      selection: "random",
      eligible_count: jobs.length,
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
