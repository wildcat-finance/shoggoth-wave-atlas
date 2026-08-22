import wavesData from "./waves-data.json";
import type { WaveRecord } from "./WaveAtlas";

export const jobRule =
  "open issue with zero recorded hard dependencies in the earliest wave containing one";

export function eligibleJobs() {
  const waves = wavesData as WaveRecord[];
  const wave = waves.find((candidate) =>
    candidate.members.some(
      (issue) => issue.state === "open" && issue.dependencies.length === 0,
    ),
  );
  const jobs =
    wave?.members.filter(
      (issue) => issue.state === "open" && issue.dependencies.length === 0,
    ) ?? [];

  return { wave, jobs };
}

export function fiatPrompt(job: { number: number; url: string }) {
  return [
    "I'd like to help build Shoggoth, the collective of assistants for crypto and financial development.",
    "Please help me install the wildcat-finance/skills package, then tell me exactly what I need to do to start a Fiat run",
    `for issue #${job.number}: ${job.url}`,
    "Read the repository instructions before making changes. If you need access or setup from me, ask for it first.",
  ].join(" ");
}
