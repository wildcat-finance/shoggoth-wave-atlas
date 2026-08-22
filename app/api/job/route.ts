import wavesData from "../../waves-data.json";
import type { WaveRecord } from "../../WaveAtlas";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

export function GET(request: Request) {
  const waves = wavesData as WaveRecord[];
  const wave = waves.find((candidate) =>
    candidate.members.some(
      (issue) => issue.state === "open" && issue.dependencies.length === 0,
    ),
  );

  const candidates =
    wave?.members.filter(
      (issue) => issue.state === "open" && issue.dependencies.length === 0,
    ) ?? [];
  const all = new URL(request.url).searchParams.get("all") === "true";

  return Response.json(
    {
      schema: "wildcat-wave-job/v1",
      rule: "open issue with zero recorded hard dependencies in the earliest wave containing one",
      source: "https://github.com/wildcat-finance/skills/milestones",
      wave: wave
        ? {
            title: wave.title,
            milestone_number: wave.number,
            url: wave.url,
          }
        : null,
      eligible_count: candidates.length,
      ...(all
        ? {
            jobs: candidates.map((issue) => ({
              number: issue.number,
              title: issue.title,
              url: issue.url,
            })),
          }
        : {
            job: candidates[0]
              ? {
                  number: candidates[0].number,
                  title: candidates[0].title,
                  url: candidates[0].url,
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
