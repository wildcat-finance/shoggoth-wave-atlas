import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function gh(path, fields = []) {
  const args = ["api", "--paginate", "--slurp", path, "--method", "GET"];
  for (const [name, value] of fields) args.push("-f", `${name}=${value}`);
  const output = execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(output).flat();
}

function waveKey(title) {
  const match = title.match(/^Wave\s+(\d+)([^\s]*)/i);
  if (!match) return [999, title];
  const suffix = match[2].toLowerCase();
  const family = suffix.includes("α") ? 0 : suffix.includes("β") ? 1 : 2;
  const subdivision = suffix.includes("b") ? 1 : 0;
  return [Number(match[1]) * 10 + family * 2 + subdivision, title];
}

function scoreFor(description, issueNumber) {
  const match = description.match(new RegExp(`#${issueNumber}\\s*\\((\\d+)\\)`));
  return match ? Number(match[1]) : null;
}

function descriptionOrder(description, issueNumber) {
  const index = description.indexOf(`#${issueNumber}`);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

const milestones = gh("repos/wildcat-finance/skills/milestones", [
  ["state", "all"],
  ["per_page", "100"],
]);
const allIssues = gh("repos/wildcat-finance/skills/issues", [
  ["state", "all"],
  ["per_page", "100"],
]).filter((issue) => !issue.pull_request);
const issues = allIssues.filter((issue) => issue.milestone);

const issueByNumber = new Map(allIssues.map((issue) => [issue.number, issue]));
const issueByKey = new Map(
  allIssues.map((issue) => [
    issue.title.split(/\s+[—–-]\s+/)[0].trim().toLowerCase(),
    issue,
  ]),
);
const dependencyNumbers = new Map(allIssues.map((issue) => [issue.number, new Set()]));

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
        if (dependency) dependencyNumbers.get(issue.number).add(dependency.number);
      }
    }

    if (/ordered chain:/i.test(line)) {
      const chain = [...line.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
      const position = chain.indexOf(issue.number);
      if (position > 0) dependencyNumbers.get(issue.number).add(chain[position - 1]);
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

writeFileSync(
  resolve("app/waves-data.json"),
  `${JSON.stringify(waves, null, 2)}\n`,
);
console.log(`Captured ${waves.length} waves and ${waves.flatMap((wave) => wave.members).length} issues.`);
