# Shoggoth Wave Atlas

Shoggoth Wave Atlas shows the Wildcat Skills issue waves and offers a random
open issue whose recorded hard dependencies are closed. The app uses the
checked-in `app/waves-data.json` snapshot; `scripts/sync-waves.mjs` refreshes
that file from GitHub, and ordinary requests and builds do not refresh it.

## `/api/job`

`GET /api/job` returns this exact JSON shape:

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
  schema: "wildcat-wave-job/v1";
  rule: "random open issue from any wave whose recorded hard dependencies are all closed";
  source: "https://github.com/wildcat-finance/skills/milestones";
  selection: "random";
  eligible_count: number;
  job: WaveJob | null;
};
```

`GET /api/job?all=true` returns the same five common fields and replaces
`job` with `jobs: WaveJob[]`. Both forms send `Cache-Control: no-store` and
allow cross-origin `GET` and `OPTIONS` requests.

## Local development

Requires Node.js 22.13.0 or newer.

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run build
npm test
```

Refresh the checked-in issue snapshot with an authenticated GitHub CLI:

```bash
node scripts/sync-waves.mjs
```
