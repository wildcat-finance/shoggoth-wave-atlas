import { appendFileSync } from "node:fs";

// The inspectable record of a release.
//
// Every accepted revision gets a GitHub deployment in the `production`
// environment: what was packaged, what the verifier found, and which URL was
// checked. Two subcommands:
//
//   start  --revision <sha> [--allow-rollback]
//   finish --deployment <id> --state success|failure --revision <sha> [--detail "..."]
//
// `start` also refuses two orderings that a re-run can otherwise produce: a
// revision that is not on main, and a revision older than the one currently
// verified in production. The second is a rollback, which is a decision rather
// than an accident, so it requires --allow-rollback.

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!token) throw new Error("Set GITHUB_TOKEN to a token that may write deployments.");
const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("Set GITHUB_REPOSITORY to owner/repo.");
}

const ENVIRONMENT = process.env.RELEASE_ENVIRONMENT ?? "production";
const DEPLOY_URL = process.env.DEPLOY_URL ?? "";
const BASE_BRANCH = process.env.BASE_BRANCH ?? "main";

// Statuses and paths only. No response body reaches the log, so no credential
// can travel out through an error message.
async function api(method, path, body) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shoggoth-wave-atlas-release",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} returned ${response.status}`);
  }
  return response.json();
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function emit(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  console.log(`${key}=${value}`);
}

// `compare` answers with the head's position relative to the base: `identical`,
// `behind` (head is an ancestor of base), `ahead`, or `diverged`.
async function relation(base, head) {
  const comparison = await api("GET", `/compare/${base}...${head}`);
  return comparison.status;
}

async function lastVerifiedRevision() {
  const deployments = await api(
    "GET",
    `/deployments?environment=${encodeURIComponent(ENVIRONMENT)}&per_page=100`,
  );
  for (const deployment of deployments) {
    const statuses = await api("GET", `/deployments/${deployment.id}/statuses?per_page=100`);
    if (statuses.some((status) => status.state === "success")) return deployment.sha;
  }
  return undefined;
}

async function start() {
  const revision = argument("revision");
  if (!revision || !SHA_PATTERN.test(revision)) {
    throw new Error("Pass --revision with a full 40-character commit SHA.");
  }

  // A release publishes accepted history, never a commit that only exists on
  // somebody's branch.
  const onBase = await relation(BASE_BRANCH, revision);
  if (!["identical", "behind"].includes(onBase)) {
    throw new Error(`${revision} is ${onBase} relative to ${BASE_BRANCH}; refusing to release it.`);
  }

  const verified = await lastVerifiedRevision();
  if (verified && verified !== revision) {
    const position = await relation(verified, revision);
    if (position === "behind" && !flag("allow-rollback")) {
      throw new Error(
        `${revision} is older than the verified release ${verified}. ` +
          "Re-run with --allow-rollback if going backwards is the intent.",
      );
    }
  }

  const deployment = await api("POST", "/deployments", {
    ref: revision,
    environment: ENVIRONMENT,
    auto_merge: false,
    required_contexts: [],
    production_environment: true,
    transient_environment: false,
    description: flag("allow-rollback")
      ? "Atlas release (explicit rollback)"
      : "Atlas release",
  });

  await api("POST", `/deployments/${deployment.id}/statuses`, {
    state: "in_progress",
    description: "Packaged; awaiting publication and verification",
    ...(DEPLOY_URL ? { environment_url: DEPLOY_URL } : {}),
    ...(process.env.RELEASE_LOG_URL ? { log_url: process.env.RELEASE_LOG_URL } : {}),
  });

  emit("deployment_id", deployment.id);
  emit("revision", revision);
  emit("previous_verified_revision", verified ?? "");
}

async function finish() {
  const deploymentId = argument("deployment");
  const state = argument("state");
  const revision = argument("revision") ?? "";
  if (!deploymentId) throw new Error("Pass --deployment with the deployment id from `start`.");
  if (!["success", "failure"].includes(String(state))) {
    throw new Error("Pass --state success or --state failure.");
  }

  const detail = argument("detail");
  await api("POST", `/deployments/${deploymentId}/statuses`, {
    state,
    description: (
      detail ??
      (state === "success"
        ? `Verified live at ${revision}`
        : `Verification failed for ${revision}`)
    ).slice(0, 140),
    ...(DEPLOY_URL ? { environment_url: DEPLOY_URL } : {}),
    ...(process.env.RELEASE_LOG_URL ? { log_url: process.env.RELEASE_LOG_URL } : {}),
  });

  console.log(`Recorded ${state} for deployment ${deploymentId}.`);
}

const subcommand = process.argv[2];
if (subcommand === "start") await start();
else if (subcommand === "finish") await finish();
else throw new Error("Use `start` or `finish`.");
