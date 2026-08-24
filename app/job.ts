import snapshotWaves from "./waves-data.json";
import type { WaveRecord } from "./WaveAtlas";

export const jobRule =
  "random open issue from any wave whose recorded hard dependencies are all closed";

export const checkpointWorkUrl =
  "https://github.com/wildcat-finance/skills/pull/479";

export function eligibleJobs(waves: WaveRecord[] = snapshotWaves as WaveRecord[]) {
  const jobs = waves.flatMap((wave) =>
    wave.members
      .filter(
        (issue) =>
          issue.state === "open" &&
          issue.dependencies.every((dependency) => dependency.state === "closed"),
      )
      .map((issue) => ({ ...issue, wave })),
  );

  return jobs;
}

export function randomEligibleJob(
  waves: WaveRecord[] = snapshotWaves as WaveRecord[],
) {
  const jobs = eligibleJobs(waves);
  if (jobs.length === 0) return null;
  return jobs[Math.floor(Math.random() * jobs.length)];
}

export function fiatPrompt(job: { number: number; url: string }) {
  return [
    "I'd like to help build the Shoggoth, a collective of specialist assistants for crypto and financial development, created and maintained by Wildcat Labs.",
    "Please help me install the wildcat-finance/skills package and get ready to contribute",
    `to issue #${job.number}: ${job.url}`,
    `Fiat does not yet support checkpointing. Work is actively ongoing to complete it: ${checkpointWorkUrl}`,
    "Until checkpointing is ready, I must complete the entire Fiat run locally once it starts, or unfinished work may be lost.",
    "Read the repository instructions first, then tell me exactly what I need to do to start and complete its Fiat run locally.",
    "Tell me plainly when each Fiat phase is complete and what evidence or receipt now exists. Do not assume another contributor or session can resume an incomplete run.",
    "If you need access or setup from me, ask before making changes.",
  ].join(" ");
}
