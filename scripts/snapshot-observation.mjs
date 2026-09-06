import { isDeepStrictEqual } from "node:util";

// A refresh is an observation, not automatically a new snapshot. Keep the
// previous observation time when every byte represented by the fallback is
// unchanged. Otherwise a scheduled no-op rewrites only generated_at, creates a
// pull request, and eventually publishes a new application version that says
// nothing new.
export function generatedAtFor({
  previousWaves,
  previousMeta,
  waves,
  sourceRevision,
  dropped,
  observedAt,
}) {
  const previousTime = previousMeta?.generated_at;
  const previousTimeIsValid =
    typeof previousTime === "string" && Number.isFinite(Date.parse(previousTime));

  if (
    previousTimeIsValid &&
    isDeepStrictEqual(previousWaves, waves) &&
    previousMeta.source_revision === sourceRevision &&
    isDeepStrictEqual(previousMeta.dropped, dropped)
  ) {
    return previousTime;
  }

  return observedAt;
}
