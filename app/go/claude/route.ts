import { fiatPrompt, randomEligibleJob } from "../../job";
import { loadWaves } from "../../waves-source";

export async function GET(
  request: Request,
  context?: { env?: { GITHUB_TOKEN?: string }; ctx?: { waitUntil?: (promise: Promise<unknown>) => void } },
) {
  const { waves } = await loadWaves(context?.env, context?.ctx);
  const job = randomEligibleJob(waves);
  if (!job) {
    return Response.json(
      { error: "No dependency-clear job is available." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const destination = new URL("https://claude.ai/new");
  destination.searchParams.set("q", fiatPrompt(job));
  return new Response(null, {
    status: 307,
    headers: { Location: destination.toString(), "Cache-Control": "no-store" },
  });
}
