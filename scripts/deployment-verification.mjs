// The checks behind scripts/verify-deployment.mjs, separated so they can be
// tested without a deployment to point at.
//
// This proves one thing: the origin answering right now was built from the
// revision the release intended. Everything else it asserts is there to stop a
// response that merely looks healthy from passing for one that is.

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const READ_MODES = ["live", "cache", "snapshot"];

export const FETCH_TIMEOUT_MS = 15_000;

export function resolveEndpoint(deploymentUrl) {
  if (!deploymentUrl) {
    throw new Error(
      "Set DEPLOY_URL to the deployed Atlas origin, for example https://atlas.example",
    );
  }
  const endpoint = new URL("/api/job?all=true", deploymentUrl);
  if (endpoint.protocol !== "https:") {
    throw new Error("DEPLOY_URL must use https");
  }
  return endpoint;
}

export function resolveExpectedRevision(expectedRevision) {
  if (!expectedRevision || !SHA_PATTERN.test(expectedRevision)) {
    throw new Error(
      "Set EXPECTED_BUILD_REVISION to the immutable 40-character Atlas commit being deployed.",
    );
  }
  return expectedRevision;
}

// Report every mismatch rather than the first. A release that has both an old
// artifact and a broken source read should say so once, not across two runs.
export function inspectDeployment(payload, expectedRevision) {
  const problems = [];
  const body = payload && typeof payload === "object" ? payload : {};

  const deployedRevision = body.build_revision;
  if (typeof deployedRevision !== "string" || !SHA_PATTERN.test(deployedRevision)) {
    problems.push("Deployment did not return a valid build_revision");
  } else if (deployedRevision !== expectedRevision) {
    problems.push(`Deployment is ${deployedRevision}, expected ${expectedRevision}`);
  }

  // The Atlas always knows which Skills commit it answered from. A response
  // without one is either older than that guarantee or serving something other
  // than the Atlas.
  const sourceRevision = body.source_revision;
  if (typeof sourceRevision !== "string" || !SHA_PATTERN.test(sourceRevision)) {
    problems.push("Deployment did not return a full 40-character source_revision");
  }

  // `live`, `cache`, and `snapshot` are the whole vocabulary. Anything else
  // means the response did not come from a reader this verifier understands.
  if (!READ_MODES.includes(String(body.read_from))) {
    problems.push(
      `Deployment reported read_from ${JSON.stringify(body.read_from)}; expected one of ${READ_MODES.join(", ")}`,
    );
  }

  return { ok: problems.length === 0, problems };
}

export async function readDeployment(endpoint, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      // A redirect would let a different origin answer for this one.
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown network failure";
    throw new Error(`Could not fetch deployment at ${endpoint}: ${detail}`);
  }
  if (!response.ok) {
    throw new Error(`Deployment returned ${response.status} from ${endpoint}`);
  }
  return response.json();
}
