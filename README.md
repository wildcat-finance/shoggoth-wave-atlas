# Shoggoth Wave Atlas

Shoggoth Wave Atlas shows the Wildcat Skills issue waves and offers a random
open issue whose recorded hard dependencies are closed. It reads GitHub live
behind a ten-minute cache. The checked-in `app/waves-data.json` is a fallback,
not the ordinary source. `scripts/sync-waves.mjs` refreshes that fallback.

## `/api/job`

`GET /api/job` returns this JSON shape:

```ts
type WaveJob = {
  number: number;
  title: string;
  url: string;
  prompt: string;
  wave: {
    title: string;
    milestone_number: number;
    url: string;
  };
};

type WaveJobResponse = {
  schema: "wildcat-wave-job/v2";
  rule: "random open issue from any wave whose recorded hard dependencies are all closed";
  source: "https://github.com/wildcat-finance/skills/milestones";
  selection: "random";
  read_from: "live" | "cache" | "snapshot";
  generated_at: string;
  // Skills main observed while this response was assembled. This is
  // provenance, not an atomic snapshot guarantee for GitHub metadata reads.
  source_revision: string;
  // Commit embedded into the Atlas artifact at build time.
  build_revision: string;
  cache_seconds: number;
  eligible_count: number;
  open_issues_without_a_wave: Array<{ number: number; title: string; url: string }>;
  read_error?: string;
  credential_present?: boolean;
  job: WaveJob | null;
};
```

`GET /api/job?all=true` returns the same metadata and replaces `job` with
`jobs: WaveJob[]`. Both forms send `Cache-Control: no-store` and allow
cross-origin `GET` and `OPTIONS` requests.

`read_from: "snapshot"` means the live GitHub read failed. In that case,
`generated_at` and `source_revision` describe the checked-in fallback. Do not
treat a source revision as a transactional GitHub snapshot: issue and milestone
APIs are separately paginated reads.

## Local development

Requires Node.js 22.13.0 or newer.

```bash
npm ci
npm run dev
```

Build and test:

```bash
npm test
npm run lint
```

Refresh the checked-in issue fallback with an authenticated GitHub CLI:

```bash
node scripts/sync-waves.mjs
```

## Release verification

The build embeds the Atlas commit SHA. After deploying, prove that the serving
artifact matches current Atlas `main` with:

```bash
EXPECTED_BUILD_REVISION="$GITHUB_SHA" DEPLOY_URL=https://atlas.example node scripts/verify-deployment.mjs
```

The script reads `/api/job?all=true` from the deployed origin and fails unless
its `build_revision` equals the immutable Atlas revision supplied by the release
pipeline. It also rejects redirects, non-HTTPS URLs, and responses that exceed
the fifteen-second timeout. It prints the Skills source mode, observed time,
and observed source revision. It does not deploy anything.
