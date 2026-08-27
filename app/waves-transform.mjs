// The wave transform, shared by the live reader and the sync script.
//
// Both callers must agree on what a wave is, which issues belong to it, and
// what counts as a dependency. Two copies of these rules would drift, and the
// drift would be invisible: the snapshot and the live read would disagree about
// eligibility while both looked correct.
//
// Nothing here performs I/O. Callers supply raw GitHub milestone and issue
// payloads and receive the records the app renders.

// Some generated milestone prose arrives through GitHub with literal `\\n`
// sequences. Preserve real line breaks and decode only that escaped form so
// the snapshot fallback renders the same useful first line as live data.
function normalizedDescription(description) {
  return description.replaceAll("\\n", "\n");
}

// Waves sort by their number. A lettered subdivision ("Wave 5b") sorts after
// the wave it subdivides. The α and β families are retired, so nothing here
// reads a family suffix; a title that does not parse sorts last, by title.
export function waveKey(title) {
  const match = title.match(/^Wave\s+(\d+)([a-z]*)/i);
  if (!match) return [Number.MAX_SAFE_INTEGER, title];
  const subdivision = match[2] ? 1 : 0;
  return [Number(match[1]) * 2 + subdivision, title];
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
// `dropped` names every OPEN issue the Atlas cannot offer: one carrying no
// milestone at all, and one carrying a milestone that is not a wave. Both are
// invisible by design, since the Atlas offers waves, but the exclusion used to
// be silent, and a milestone like `Handover` hides work just as effectively as
// no milestone does.
export function buildWaves({ milestones, issues: rawIssues }) {
  const allIssues = rawIssues.filter((issue) => !issue.pull_request);
  const waveMilestones = new Set(
    milestones
      .filter((milestone) => milestone.title.startsWith("Wave "))
      .map((milestone) => milestone.number),
  );
  const issues = allIssues.filter(
    (issue) => issue.milestone && waveMilestones.has(issue.milestone.number),
  );
  const dropped = allIssues
    .filter(
      (issue) =>
        issue.state === "open" &&
        (!issue.milestone || !waveMilestones.has(issue.milestone.number)),
    )
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url:
        issue.html_url ??
        `https://github.com/wildcat-finance/skills/issues/${issue.number}`,
      reason: issue.milestone
        ? `milestone "${issue.milestone.title}" is not a wave`
        : "no milestone",
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
      const description = normalizedDescription(milestone.description?.trim() || "");
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
