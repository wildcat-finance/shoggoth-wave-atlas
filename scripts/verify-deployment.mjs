import {
  inspectDeployment,
  readDeployment,
  resolveEndpoint,
  resolveExpectedRevision,
} from "./deployment-verification.mjs";

// Prove that the origin serving right now was built from a named Atlas commit.
// This deploys nothing: it is the check a release runs after publication, and
// the check a person runs when they want to know what is actually live.

const endpoint = resolveEndpoint(process.env.DEPLOY_URL);
const expectedRevision = resolveExpectedRevision(process.env.EXPECTED_BUILD_REVISION);

const payload = await readDeployment(endpoint);
const { ok, problems } = inspectDeployment(payload, expectedRevision);

if (!ok) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log(`Deployment verified: ${endpoint.origin}`);
console.log(`Atlas build: ${payload.build_revision}`);
console.log(`Skills read: ${payload.read_from} at ${payload.generated_at}`);
console.log(`Skills revision: ${payload.source_revision}`);
