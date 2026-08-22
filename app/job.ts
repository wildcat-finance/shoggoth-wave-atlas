import wavesData from "./waves-data.json";
import type { WaveRecord } from "./WaveAtlas";

export const jobRule =
  "random open issue from any wave whose recorded hard dependencies are all closed";

export function eligibleJobs() {
  const waves = wavesData as WaveRecord[];
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

export function randomEligibleJob() {
  const jobs = eligibleJobs();
  if (jobs.length === 0) return null;
  return jobs[Math.floor(Math.random() * jobs.length)];
}

export function fiatPrompt(job: { number: number; url: string }) {
  return [
    "I'd like to help build the Shoggoth, a collective of specialist assistants for crypto and financial development, created and maintained by Wildcat Labs.",
    "Please help me install the wildcat-finance/skills package and get ready to contribute",
    `to issue #${job.number}: ${job.url}`,
    "I am welcome to work for as little or as long as I want, so help me take one bounded checkpoint at a time and let me stop cleanly at any checkpoint instead of assuming I will finish the whole issue.",
    "Read the repository instructions first, then tell me exactly what I need to do to start or resume its Fiat run.",
    "Be very explicit whenever each checkpoint stage is reached, what evidence or receipt now exists, and what a later contributor would need to continue.",
    "If you need access or setup from me, ask before making changes.",
  ].join(" ");
}
