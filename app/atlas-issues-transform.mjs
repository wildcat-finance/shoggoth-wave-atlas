const ATLAS_REPOSITORY = "wildcat-finance/shoggoth-wave-atlas";

function labelName(label) {
  if (typeof label === "string" && label.trim()) return label.trim();
  if (
    label &&
    typeof label === "object" &&
    typeof label.name === "string" &&
    label.name.trim()
  ) {
    return label.name.trim();
  }
  throw new Error("Atlas issue carried an invalid label");
}

// Atlas-maintenance issues are deliberately not wave members. They belong to
// the repository that renders this site, so the page presents them as their
// own category and the Skills job API never offers them as Fiat work.
export function buildAtlasIssues(rawIssues) {
  if (!Array.isArray(rawIssues)) {
    throw new Error("GitHub Atlas issues response was not an array");
  }

  return rawIssues
    .filter((issue) => !issue?.pull_request && issue?.state === "open")
    .map((issue) => {
      if (
        !Number.isInteger(issue.number) ||
        typeof issue.title !== "string" ||
        !issue.title.trim() ||
        typeof issue.updated_at !== "string" ||
        !Number.isFinite(Date.parse(issue.updated_at)) ||
        !Array.isArray(issue.labels)
      ) {
        throw new Error("GitHub returned a malformed open Atlas issue");
      }

      return {
        number: issue.number,
        title: issue.title.trim(),
        url: `https://github.com/${ATLAS_REPOSITORY}/issues/${issue.number}`,
        updatedAt: issue.updated_at,
        labels: issue.labels.map(labelName),
      };
    })
    .sort((a, b) => b.number - a.number);
}
