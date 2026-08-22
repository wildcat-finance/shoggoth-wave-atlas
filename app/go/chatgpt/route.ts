import { eligibleJobs, fiatPrompt } from "../../job";

export function GET() {
  const job = eligibleJobs().jobs[0];
  if (!job) {
    return Response.json(
      { error: "No dependency-clear job is available." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const destination = new URL("https://chatgpt.com/");
  destination.searchParams.set("q", fiatPrompt(job));
  return Response.redirect(destination, 307);
}
