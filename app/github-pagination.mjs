export function githubPageUrl({ repository, path, state, pageSize, after }) {
  const url = new URL(`https://api.github.com/repos/${repository}/${path}`);
  url.searchParams.set("state", state);
  url.searchParams.set("per_page", String(pageSize));
  if (after) url.searchParams.set("after", after);
  return url.toString();
}

export function nextGithubCursor(linkHeader) {
  if (!linkHeader) return undefined;

  for (const part of linkHeader.split(",")) {
    const match = part.match(/^\s*<([^>]+)>\s*;(.*)$/);
    if (!match || !/(?:^|;)\s*rel="?next"?(?:;|$)/i.test(match[2])) continue;

    const after = new URL(match[1]).searchParams.get("after");
    if (!after) {
      throw new Error("GitHub's next-page link did not contain an after cursor");
    }
    return after;
  }

  return undefined;
}
