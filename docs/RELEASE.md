# Releasing the Atlas

Two automated paths touch this repository, and they do not overlap.

| | Fallback snapshot refresh | Release verification |
| --- | --- | --- |
| Workflow | `.github/workflows/fallback-refresh.yml` | `.github/workflows/release-verification.yml` |
| Owns | `app/waves-data.json`, `app/waves-meta.json` | the served application |
| Produces | one pull request | one packaged artifact and one deployment record |
| Touches production | never | never publishes; it verifies |

The refresh maintains the recovery floor. The release path publishes the
application. A release never regenerates fallback data, and a refresh never
deploys. If a release ever needed a snapshot refresh to succeed, the Atlas
would have quietly become a snapshot-driven site again, which it is not.

## Where the site actually lives

`.openai/hosting.json` names Sites project
`appgprj_6a895aa2e35c8191b3cbf5733f7866ee`, served at
<https://shoggoth-wave-atlas.functi0nzer0.chatgpt.site>.

The Sites record confirms that this project id serves that hostname, and names
an individual as its owner rather than an organisation workspace. The Sites API
does not expose the owning workspace's label, so there is no workspace name to
record here. That is the resolution of the "project not visible" question: a
different workspace connected to this repository will not list the project. It
is an ownership boundary, not a stale mapping and not a lost project.

**This has a consequence for migration.** The public hostname is derived from
the owning account. Recreating the project under another account or workspace
produces a different origin, and every consumer of `/api/job` is pointed at the
current one. Do not create a replacement project to "move" it.

No transfer operation is exposed: the Sites connector has no move or transfer
call, and none is documented. Treat an identity-preserving transfer to an
organisation workspace as unavailable rather than merely unattempted. If one
appears later it must keep both the project id and the hostname to be worth
taking. Changing `.openai/hosting.json` to a new project id is a deliberate
migration with a URL change, not a fix, and it should not be merged as one.

## Why nothing here publishes

Publication is a Sites connector call from an authenticated Codex session on
the owning account. There is no Sites CLI, no public deployment API, no service
credential, and no GitHub App: nothing a workflow could hold. The organisation
Projects API is an API-management surface and carries no version or deployment
operations. This repository will not invent a private endpoint or hold a
long-lived personal token to fake one, so the release workflow is named for
what it does — it packages and verifies — and a person performs the publish.

`@openai/sites-vite-plugin` packages `.openai/hosting.json` (and `drizzle/**`,
when present) into `dist/.openai/`. The artifact this workflow uploads is
therefore exactly what a Sites version is saved from.

## Normal release

1. A pull request merges to `main`. `CI` has already run build, test, and lint
   on it and published nothing.
2. `Release verification` starts automatically for the merge commit. It:
   - builds that exact revision with `GITHUB_SHA` set to its full SHA,
   - refuses the run if the build modified tracked source,
   - checks that the artifact embeds that revision and addresses Sites project
     `appgprj_6a895aa2e35c8191b3cbf5733f7866ee`,
   - uploads `atlas-<sha>` as the artifact to publish,
   - opens a `production` deployment record marked *in progress*.
3. Publish that revision from the owning Codex account. In a Codex session with
   this repository, on a clean checkout of that exact commit:

   ```bash
   GITHUB_SHA=<sha> npm run build
   EXPECTED_BUILD_REVISION=<sha> \
   EXPECTED_SITES_PROJECT=appgprj_6a895aa2e35c8191b3cbf5733f7866ee \
   node scripts/check-package.mjs
   ```

   Then, through the Sites connector: `sites_save_site_version` with the
   project id, the commit SHA, and an archive of `dist`; `sites_deploy_site_version`
   with the saved version id it returns; `sites_get_deployment_status` to
   confirm. Sites keeps its own internal source branch and may need it
   fast-forwarded to the commit being published before the save succeeds; that
   happens inside Sites and never touches this repository's GitHub remote.
4. The workflow polls `/api/job?all=true` until `build_revision` equals the
   accepted SHA, then marks the deployment `success`. If the origin never
   catches up within the polling window it marks the deployment `failure`.

Runs are serialised by the `atlas-release` concurrency group, so two merges
cannot verify out of order. A merge that is superseded before anyone publishes
it records a failed deployment, which is accurate: that revision was never
served. Publish the newer one.

## Manual recovery

Run `Release verification` from the Actions tab with `revision` set to a full
40-character `main` commit. The workflow refuses a revision that is not
contained in `main`.

To check the live origin from a laptop, without any workflow:

```bash
EXPECTED_BUILD_REVISION=<full-sha> \
DEPLOY_URL=https://shoggoth-wave-atlas.functi0nzer0.chatgpt.site \
node scripts/verify-deployment.mjs
```

It exits non-zero unless the origin answers over HTTPS without redirecting,
within fifteen seconds, with `build_revision` equal to the revision given, a
full 40-character `source_revision`, and a `read_from` of `live`, `cache`, or
`snapshot`.

## Rollback

A failed build changes nothing: no artifact is uploaded, no version is saved,
and production keeps serving whatever it was serving.

A failed verification means the live origin is not the revision that was
accepted. Restore the last verified version rather than rebuilding it: every
saved Sites version stays listed and redeployable, keyed by an id of the shape
`appgprj_…~appgver_…`, and each one records the commit SHA it was built from.
List them through the Sites connector (`list_site_versions`), find the last
version whose SHA matches a `success` deployment record in the `production`
environment, and redeploy that id with `sites_deploy_site_version`. Nothing is
rebuilt, so the bytes that go back are the bytes that were verified. Confirm:

```bash
EXPECTED_BUILD_REVISION=<last-verified-sha> \
DEPLOY_URL=https://shoggoth-wave-atlas.functi0nzer0.chatgpt.site \
node scripts/verify-deployment.mjs
```

Going backwards deliberately is a rollback, and the workflow treats it as a
decision rather than an accident: a manual dispatch for a revision older than
the currently verified one is refused unless `allow_rollback` is checked.

## Credentials

- The workflows use only `GITHUB_TOKEN`, scoped per job: `contents: read` for
  CI and packaging, `deployments: write` for the release record, and
  `contents: write` plus `pull-requests: write` for the fallback refresh.
- No workflow persists a credential in a Git remote or in `.git/config`; every
  checkout sets `persist-credentials: false`, and every write to GitHub goes
  through the API with the token passed in the environment.
- The Sites publication credential is the owning account's authenticated Codex
  connector session. It is not stored in this repository and must not be added
  to it. Rotate it by re-authenticating that account; nothing here needs
  updating when it changes.
- A publish may mint a short-lived credential for Sites' own internal source
  repository. It is scoped to that repository, cannot save or deploy versions
  on its own, and expires; a later publish obtains a fresh one through the
  connector. Do not persist it, and do not put it in a workflow.
- If a Sites publisher credential is ever added as an Actions secret, rotate it
  by replacing the secret and re-running the release for the current `main`;
  never print it, and never write it into a file inside the artifact.

## The boundary with the fallback refresh

The fallback refresh (see the README) owns `app/waves-data.json` and
`app/waves-meta.json` and proposes them through a pull request. Release
verification never regenerates them, and its "refuse an artifact built from
mutated source" step exists to prove it: if a release ever produced a snapshot
change of its own, the run fails rather than shipping bytes that do not match
the accepted commit.
