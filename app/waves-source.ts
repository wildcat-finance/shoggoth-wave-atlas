import { buildWaves } from "./waves-transform.mjs";
import type { WaveRecord } from "./WaveAtlas";
import snapshotWaves from "./waves-data.json";
import snapshotMeta from "./waves-meta.json";

const REPOSITORY = "wildcat-finance/skills";
const CACHE_KEY = "https://wave-atlas.internal/waves-v1";
const CACHE_SECONDS = 600;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const FETCH_TIMEOUT_MS = 8000;

export type WavesSource = "live" | "cache" | "snapshot";

export type LoadedWaves = {
  waves: WaveRecord[];
  generatedAt: string;
  source: WavesSource;
  droppedWithoutWave: Array<{ number: number; title: string; url: string }>;
  // Why the live read did not answer, when it did not. A fallback that cannot
  // say why is indistinguishable from a fresh read of a quiet backlog, and the
  // caller is the one who needs to tell those apart.
  readError?: string;
  // True when a GITHUB_TOKEN binding was found for this request.
  credentialPresent?: boolean;
};

// The Cloudflare binding, read the way db/index.ts reads its own. Route
// handlers follow the App Router signature and never receive `env`, so taking
// it from a handler argument would have left the token permanently unread and
// every request unauthenticated.
async function bindingToken(): Promise<string | undefined> {
  // Two places a host can put a secret, tried in order. `cloudflare:workers`
  // is how db/index.ts reads its own binding, so it is first; a platform that
  // injects into the process environment instead is the other real case. Route
  // handlers are not consulted, because vinext follows the App Router
  // signature and never passes `env` to one.
  try {
    const { env } = (await import("cloudflare:workers")) as {
      env?: Record<string, string | undefined>;
    };
    if (env?.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  } catch {
    // Not running on Workers, so there is no binding of this kind to read.
  }

  try {
    const fromProcess = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env?.GITHUB_TOKEN;
    if (fromProcess) return fromProcess;
  } catch {
    // No process environment either.
  }

  return undefined;
}

function snapshot(readError?: string): LoadedWaves {
  return {
    waves: snapshotWaves as WaveRecord[],
    generatedAt: snapshotMeta.generated_at,
    source: "snapshot",
    droppedWithoutWave: snapshotMeta.dropped ?? [],
    ...(readError ? { readError } : {}),
  };
}

async function githubPages(path: string, token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub rejects an unidentified client, and an honest agent string is
    // cheaper to diagnose later than a generic one.
    "User-Agent": "shoggoth-wave-atlas",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const collected: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${REPOSITORY}/${path}?state=all&per_page=${PAGE_SIZE}&page=${page}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Say which failure this is. A 403 from an unauthenticated request and a
      // 403 from an exhausted quota are the same status with different causes,
      // and the response already distinguishes them: the per-hour limit is 60
      // without a credential and 5000 with one. GitHub's own message is
      // carried through; the token never is.
      const limit = response.headers.get("x-ratelimit-limit") ?? "unknown";
      const remaining = response.headers.get("x-ratelimit-remaining") ?? "unknown";
      let detail = "";
      try {
        const payload = (await response.json()) as { message?: string };
        if (typeof payload.message === "string") {
          detail = `: ${payload.message.slice(0, 160)}`;
        }
      } catch {
        // A body that will not parse is not worth failing differently over.
      }
      throw new Error(
        `GitHub ${path} page ${page} returned ${response.status}` +
          ` (hourly limit ${limit}, remaining ${remaining}, ` +
          `credential ${token ? "sent" : "absent"})${detail}`,
      );
    }
    const body = (await response.json()) as unknown[];
    if (!Array.isArray(body)) {
      throw new Error(`GitHub ${path} page ${page} was not an array`);
    }
    collected.push(...body);
    if (body.length < PAGE_SIZE) return collected;
  }
  // A truncated read would silently shrink the eligible set, so refuse it
  // rather than serve a partial answer that looks complete.
  throw new Error(`GitHub ${path} exceeded ${MAX_PAGES} pages`);
}

async function readLive(token?: string): Promise<LoadedWaves> {
  const [milestones, issues] = await Promise.all([
    githubPages("milestones", token),
    githubPages("issues", token),
  ]);
  const { waves, dropped } = buildWaves({
    milestones: milestones as never[],
    issues: issues as never[],
  });
  if (waves.length === 0) {
    throw new Error("GitHub returned no waves");
  }
  return {
    waves: waves as WaveRecord[],
    generatedAt: new Date().toISOString(),
    source: "live",
    droppedWithoutWave: dropped,
  };
}

// Read the waves for one request.
//
// Order: a cached read under ten minutes old, then GitHub, then the compiled
// snapshot. The snapshot is the floor rather than the source, so a rate limit
// or an outage degrades the answer's freshness instead of the site. Whichever
// path answered is reported to the caller, so nobody has to infer it.
export async function loadWaves(ctx?: {
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<LoadedWaves> {
  const cache = typeof caches === "undefined" ? undefined : await caches.open("waves");

  if (cache) {
    try {
      const hit = await cache.match(CACHE_KEY);
      if (hit) {
        const cached = (await hit.json()) as LoadedWaves;
        return { ...cached, source: "cache" };
      }
    } catch {
      // A damaged cache entry is not a reason to refuse the request.
    }
  }

  const token = await bindingToken();
  let loaded: LoadedWaves;
  try {
    loaded = await readLive(token);
  } catch (error) {
    // The message is ours, built from a status and a path, so it carries no
    // credential and no response body.
    const reason =
      error instanceof Error ? error.message : "unknown read failure";
    return {
      ...snapshot(reason),
      // Whether a credential was found at all, never its value. Without this a
      // reader cannot tell a missing binding from a rejected one.
      credentialPresent: Boolean(token),
    };
  }

  if (cache) {
    const store = cache.put(
      CACHE_KEY,
      new Response(JSON.stringify(loaded), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${CACHE_SECONDS}`,
        },
      }),
    );
    if (ctx?.waitUntil) ctx.waitUntil(store);
    else await store.catch(() => {});
  }

  return loaded;
}

export const cacheSeconds = CACHE_SECONDS;
