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

That hostname is the resolution of the "project not visible" question. The
slug's second label is the owning account's handle, so the project belongs to
the personal Codex account behind `functi0nZer0`, not to a Wildcat organisation
workspace. A different workspace connected to this repository will not list the
project, which is what was observed; it is an ownership boundary, not a stale
mapping and not a lost project.

**This has a consequence for migration.** The public hostname is derived from
the owning account. Recreating the project under another account or workspace
produces a different origin, and every consumer of `/api/job` is pointed at the
current one. Do not create a replacement project to "move" it. The supported
options are:

1. **Publish from the owning account.** Sign in to Codex as the account that
   owns the project and publish from there. This keeps the project id, the
   hostname, and this repository's `hosting.json` mapping all correct, and it
   is what the release path below assumes.
2. **Ask OpenAI to transfer the project** to the target workspace, keeping the
   id and slug. Whether Sites supports such a transfer is not established from
   inside this repository; treat it as a support request, not a self-serve
   action, and do not begin it by creating a second project.

Until a transfer completes, option 1 is the release mechanism. Changing
`.openai/hosting.json` to a new project id is a deliberate migration with a URL
change, not a fix, and it should not be merged as one.

## Why nothing here publishes

Sites publication happens through the Codex/Sites interface using the owning
account's session. There is no supported non-interactive publisher for GitHub
Actions, and this repository will not invent a private endpoint or hold a
long-lived personal token to fake one. So the release workflow is named for
what it does — it packages and verifies — and the publish step is performed by
the authorised publisher on the owning account.

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
3. Publish that revision from the owning Codex account, saving a Sites version
   from the accepted source bytes.
4. The workflow polls `/api/job?all=true` until `build_revision` equals the
   accepted SHA, then marks the deployment `success`. If the origin never
   catches up within the polling window it marks the deployment `failure`.

Runs are serialised by the `atlas-release` concurrency group, so two merges
cannot verify out of order.

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
accepted. Restore the last verified version — the deployment records in the
`production` environment name it, and the Sites version history holds it — by
republishing that version from the owning account. Then confirm:

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
- The Sites publication credential is the owning account's Codex session. It is
  not stored in this repository and must not be added to it. Rotate it by
  signing out of and back into that account; nothing here needs updating when
  it changes.
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
