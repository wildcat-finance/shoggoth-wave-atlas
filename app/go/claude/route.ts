import { fiatPrompt, randomEligibleJob } from "../../job";

export function GET() {
  const job = randomEligibleJob();
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
