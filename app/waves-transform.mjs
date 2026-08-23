// The wave transform, shared by the live reader and the sync script.
//
// Both callers must agree on what a wave is, which issues belong to it, and
// what counts as a dependency. Two copies of these rules would drift, and the
// drift would be invisible: the snapshot and the live read would disagree about
// eligibility while both looked correct.
//
// Nothing here performs I/O. Callers supply raw GitHub milestone and issue
// payloads and receive the records the app renders.

export function waveKey(title) {
  const match = title.match(/^Wave\s+(\d+)([^\s]*)/i);
  if (!match) return [999, title];
  const suffix = match[2].toLowerCase();
  const family = suffix.includes("α") ? 0 : suffix.includes("β") ? 1 : 2;
  const subdivision = suffix.includes("b") ? 1 : 0;
  return [Number(match[1]) * 10 + family * 2 + subdivision, title];
}

export function scoreFor(description, issueNumber) {
  const match = description.match(new RegExp(`#${issueNumber}\\s*\\((\\d+)\\)`));
  return match ? Number(match[1]) : null;
}

export function descriptionOrder(description, issueNumber) {
  const index = description.indexOf(`#${issueNumber}`);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function dependencyMap(allIssues) {
  const issueByKey = new Map(
    allIssues.map((issue) => [
      issue.title.split(/\s+[—–-]\s+/)[0].trim().toLowerCase(),
      issue,
    ]),
  );
  const dependencyNumbers = new Map(
    allIssues.map((issue) => [issue.number, new Set()]),
  );

  for (const issue of allIssues) {
    const body = issue.body ?? "";
    for (const line of body.split("\n")) {
      if (/depends on/i.test(line)) {
        const dependencyClause = line
          .split(/depends on/i)[1]
          .split(/\bblocks\b/i)[0]
          .split(".")[0];
        for (const match of dependencyClause.matchAll(/#(\d+)/g)) {
          dependencyNumbers.get(issue.number).add(Number(match[1]));
        }
        for (const match of dependencyClause.matchAll(/`([a-z][a-z0-9-]+)`/gi)) {
          const dependency = issueByKey.get(match[1].toLowerCase());
          if (dependency) {
            dependencyNumbers.get(issue.number).add(dependency.number);
          }
        }
      }

      if (/ordered chain:/i.test(line)) {
        const chain = [...line.matchAll(/#(\d+)/g)].map((match) =>
          Number(match[1]),
        );
        const position = chain.indexOf(issue.number);
        if (position > 0) {
          dependencyNumbers.get(issue.number).add(chain[position - 1]);
        }
      }

      if (/\bblocks\b/i.test(line)) {
        const blockedClause = line.split(/\bblocks\b/i)[1].split(".")[0];
        for (const match of blockedClause.matchAll(/#(\d+)/g)) {
          const target = Number(match[1]);
          dependencyNumbers.get(target)?.add(issue.number);
        }
      }
    }
  }

  return dependencyNumbers;
}

// Build the wave records, and report what was left out.
//
// `dropped` names every OPEN issue carrying no milestone. Those issues are
// invisible to the Atlas by design, because a wave is a milestone, but the
// exclusion used to be silent: an issue could sit open and unreachable with
// nothing anywhere saying so.
export function buildWaves({ milestones, issues: rawIssues }) {
  const allIssues = rawIssues.filter((issue) => !issue.pull_request);
  const issues = allIssues.filter((issue) => issue.milestone);
  const dropped = allIssues
    .filter((issue) => !issue.milestone && issue.state === "open")
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url:
        issue.html_url ??
        `https://github.com/wildcat-finance/skills/issues/${issue.number}`,
    }))
    .sort((a, b) => a.number - b.number);

  const issueByNumber = new Map(allIssues.map((issue) => [issue.number, issue]));
  const dependencyNumbers = dependencyMap(allIssues);

  const byMilestone = new Map();
  for (const issue of issues) {
    const id = issue.milestone.number;
    byMilestone.set(id, [...(byMilestone.get(id) ?? []), issue]);
  }

  const waves = milestones
    .filter((milestone) => milestone.title.startsWith("Wave "))
    .sort((a, b) => {
      const [aOrder, aTitle] = waveKey(a.title);
      const [bOrder, bTitle] = waveKey(b.title);
      return aOrder - bOrder || aTitle.localeCompare(bTitle);
    })
    .map((milestone) => {
      const description = milestone.description?.trim() ?? "";
      const members = (byMilestone.get(milestone.number) ?? [])
        .sort((a, b) => {
          const order =
            descriptionOrder(description, a.number) -
            descriptionOrder(description, b.number);
          return order || a.number - b.number;
        })
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          url: issue.html_url,
          score: scoreFor(description, issue.number),
          dependencies: [...(dependencyNumbers.get(issue.number) ?? [])]
            .filter((number) => number !== issue.number)
            .sort((a, b) => a - b)
            .map((number) => {
              const dependency = issueByNumber.get(number);
              return {
                number,
                title: dependency?.title ?? "Unknown issue",
                state: dependency?.state ?? "unknown",
                url:
                  dependency?.html_url ??
                  `https://github.com/wildcat-finance/skills/issues/${number}`,
              };
            }),
        }));

      return {
        number: milestone.number,
        title: milestone.title,
        description,
        state: milestone.state,
        open: milestone.open_issues,
        closed: milestone.closed_issues,
        url: milestone.html_url,
        members,
      };
    });

  return { waves, dropped };
}
