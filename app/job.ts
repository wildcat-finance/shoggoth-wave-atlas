import snapshotWaves from "./waves-data.json";
import type { WaveRecord } from "./WaveAtlas";

export const jobRule =
  "random classified open issue from any wave whose recorded hard dependencies are all closed";

export type ExecutionMode = "fiat" | "pull_request" | "invalid";
export type SelectableExecutionMode = Exclude<ExecutionMode, "invalid">;

export function eligibleJobs(waves: WaveRecord[] = snapshotWaves as WaveRecord[]) {
  const jobs = waves.flatMap((wave) =>
    wave.members
      .filter(
        (issue) =>
          issue.state === "open" &&
          issue.execution_mode !== "invalid" &&
          issue.dependencies.every((dependency) => dependency.state === "closed"),
      )
      .map((issue) => ({ ...issue, wave })),
  );

  return jobs;
}

export function invalidIssues(waves: WaveRecord[] = snapshotWaves as WaveRecord[]) {
  return waves.flatMap((wave) =>
    wave.members
      .filter((issue) => issue.state === "open" && issue.execution_mode === "invalid")
      .map((issue) => ({
        ...issue,
        wave,
        ready: issue.dependencies.every((dependency) => dependency.state === "closed"),
      })),
  );
}

export function randomEligibleJob(
  waves: WaveRecord[] = snapshotWaves as WaveRecord[],
  mode?: SelectableExecutionMode,
) {
  const jobs = eligibleJobs(waves).filter(
    (job) => mode === undefined || job.execution_mode === mode,
  );
  if (jobs.length === 0) return null;
  return jobs[Math.floor(Math.random() * jobs.length)];
}

export function fiatPrompt(job: { number: number; url: string }) {
  return [
    "I'd like to help build the Shoggoth, a collective of specialist assistants for crypto and financial development, created and maintained by Wildcat Labs.",
    "I am an external contributor, not the Shoggoth.",
    "Keep my Git authorship, use my own valid signing identity, and publish through my GitHub account. Never ask me for or configure the Shoggoth signing key or GitHub account.",
    "Please use this coding environment to install the wildcat-finance/skills package and take",
    `issue #${job.number} through a complete Fiat run: ${job.url}`,
    "Fiat does not yet support checkpointing. Work is actively ongoing to complete it.",
    "Before hexctl init, confirm this environment can clone and edit the repository, run its commands, use my signing identity, and publish through my authenticated GitHub account.",
    "If it cannot, stop before init and tell me to continue in a suitable local coding harness. Do not start the run here or request or transfer Shoggoth credentials.",
    "Once Fiat starts, I must finish the same run in the same environment. Closing or abandoning an unfinished run can lose the work.",
    "Read the repository instructions first, then carry the complete Fiat workflow through rather than only telling me which commands to run.",
    "Tell me plainly when each Fiat phase is complete and what evidence or receipt now exists. Do not assume another contributor or session can resume an incomplete run.",
    "If you need access or setup for my own account, ask before making changes.",
  ].join(" ");
}

export function pullRequestPrompt(job: { number: number; url: string }) {
  return [
    "I'd like to help build the Shoggoth, a collective of specialist assistants for crypto and financial development, created and maintained by Wildcat Labs.",
    "I am an external contributor, not the Shoggoth.",
    "Keep my Git authorship, use my own valid signing identity, and publish through my GitHub account. Never ask me for or configure the Shoggoth signing key or GitHub account.",
    "Please use this coding environment to install the wildcat-finance/skills package and take",
    `issue #${job.number} through one complete pull-request job: ${job.url}`,
    "Read the repository instructions and the complete issue before changing anything.",
    "Implement the evidenced residual scope, run every relevant check, commit with my valid signing identity, push through my authenticated GitHub account, and open one reviewable pull request.",
    "Do not start Fiat, run hexctl, or write Fiat receipts for this job.",
    "Keep issue closure separate from pull-request delivery unless the repository instructions explicitly assign it to the merger.",
    "If this environment cannot clone, edit, test, sign, push, or open the pull request through my account, stop before changing the repository and explain the missing capability.",
    "If you need access or setup for my own account, ask before making changes.",
  ].join(" ");
}

export function jobPrompt(job: {
  number: number;
  url: string;
  execution_mode: ExecutionMode;
}) {
  if (job.execution_mode === "fiat") return fiatPrompt(job);
  if (job.execution_mode === "pull_request") return pullRequestPrompt(job);
  throw new Error(`Issue #${job.number} has invalid execution metadata`);
}
