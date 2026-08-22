import { eligibleJobs, jobRule } from "../../job";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

export function GET(request: Request) {
  const { wave, jobs } = eligibleJobs();
  const all = new URL(request.url).searchParams.get("all") === "true";

  return Response.json(
    {
      schema: "wildcat-wave-job/v1",
      rule: jobRule,
      source: "https://github.com/wildcat-finance/skills/milestones",
      wave: wave
        ? {
            title: wave.title,
            milestone_number: wave.number,
            url: wave.url,
          }
        : null,
      eligible_count: jobs.length,
      ...(all
        ? {
            jobs: jobs.map((issue) => ({
              number: issue.number,
              title: issue.title,
              url: issue.url,
            })),
          }
        : {
            job: jobs[0]
              ? {
                  number: jobs[0].number,
                  title: jobs[0].title,
                  url: jobs[0].url,
                }
              : null,
          }),
    },
    { headers },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
