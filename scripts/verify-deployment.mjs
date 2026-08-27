const deploymentUrl = process.env.DEPLOY_URL;
const expectedRevision = process.env.EXPECTED_BUILD_REVISION;
if (!deploymentUrl) {
  throw new Error("Set DEPLOY_URL to the deployed Atlas origin, for example https://atlas.example");
}
if (!expectedRevision || !/^[0-9a-f]{40}$/i.test(expectedRevision)) {
  throw new Error("Set EXPECTED_BUILD_REVISION to the immutable 40-character Atlas commit being deployed.");
}

const endpoint = new URL("/api/job?all=true", deploymentUrl);
if (endpoint.protocol !== "https:") {
  throw new Error("DEPLOY_URL must use https");
}

let response;
try {
  response = await fetch(endpoint, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
} catch (error) {
  const detail = error instanceof Error ? error.message : "unknown network failure";
  throw new Error(`Could not fetch deployment at ${endpoint}: ${detail}`);
}
if (!response.ok) {
  throw new Error(`Deployment returned ${response.status} from ${endpoint}`);
}
const payload = await response.json();
const deployedRevision = payload.build_revision;
if (typeof deployedRevision !== "string" || !/^[0-9a-f]{40}$/i.test(deployedRevision)) {
  throw new Error("Deployment did not return a valid build_revision");
}
if (deployedRevision !== expectedRevision) {
  throw new Error(`Deployment is ${deployedRevision}, expected ${expectedRevision}`);
}

console.log(`Deployment verified: ${endpoint.origin}`);
console.log(`Atlas build: ${deployedRevision}`);
console.log(`Skills read: ${payload.read_from} at ${payload.generated_at}`);
console.log(`Skills revision: ${payload.source_revision}`);
