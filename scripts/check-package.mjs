import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Inspect a built artifact before it is saved as a Sites version.
//
// Three questions, each of which has a wrong answer that a release would
// otherwise carry all the way to production: was this built from the revision
// we accepted, does it address the Sites project we mean, and did the build
// leave the source tree alone?

const revision = process.env.EXPECTED_BUILD_REVISION;
if (!revision || !/^[0-9a-f]{40}$/i.test(revision)) {
  throw new Error("Set EXPECTED_BUILD_REVISION to the full 40-character revision that was built.");
}

const serverRoot = resolve("dist/server");
if (!existsSync(join(serverRoot, "index.js"))) {
  throw new Error("dist/server/index.js is missing; the build did not produce a server artifact.");
}

// vite replaces __ATLAS_BUILD_REVISION__ at build time, so the accepted SHA is
// a literal somewhere in the server output. Which chunk it lands in is the
// bundler's business and changes with the build, so search rather than name a
// file: an artifact that does not contain the revision anywhere was built from
// something other than the commit this release accepted.
function embedsRevision(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (embedsRevision(path)) return true;
    } else if (entry.endsWith(".js") && readFileSync(path, "utf8").includes(revision)) {
      return true;
    }
  }
  return false;
}

if (!embedsRevision(serverRoot)) {
  throw new Error(`No file under dist/server embeds ${revision}.`);
}

const packagedHosting = resolve("dist/.openai/hosting.json");
if (!existsSync(packagedHosting)) {
  throw new Error("dist/.openai/hosting.json is missing; the Sites metadata was not packaged.");
}
const packaged = JSON.parse(readFileSync(packagedHosting, "utf8"));
const source = JSON.parse(readFileSync(resolve(".openai/hosting.json"), "utf8"));
if (packaged.project_id !== source.project_id) {
  throw new Error(
    `Packaged Sites project ${packaged.project_id} does not match ${source.project_id}.`,
  );
}
const expectedProject = process.env.EXPECTED_SITES_PROJECT;
if (expectedProject && packaged.project_id !== expectedProject) {
  throw new Error(
    `Packaged Sites project ${packaged.project_id} does not match the expected ${expectedProject}.`,
  );
}

console.log(`Artifact built from ${revision} for Sites project ${packaged.project_id}.`);
