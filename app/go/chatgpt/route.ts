import { jobPrompt, randomEligibleJob } from "../../job";
import { loadWaves } from "../../waves-source";

export async function GET() {
  const { waves } = await loadWaves();
  const job = randomEligibleJob(waves);
  if (!job) {
    return Response.json(
      { error: "No dependency-clear job is available." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const destination = new URL("codex://threads/new");
  destination.searchParams.set("prompt", jobPrompt(job));
  return new Response(null, {
    status: 307,
    headers: { Location: destination.toString(), "Cache-Control": "no-store" },
  });
}
