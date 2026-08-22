"use client";

import { useMemo, useState } from "react";

type IssueRecord = {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  score: number | null;
  dependencies: Array<{
    number: number;
    title: string;
    state: "open" | "closed" | "unknown";
    url: string;
  }>;
};

export type WaveRecord = {
  number: number;
  title: string;
  description: string;
  state: "open" | "closed";
  open: number;
  closed: number;
  url: string;
  members: IssueRecord[];
};

type Family = "all" | "alpha" | "beta" | "active";

function familyOf(title: string) {
  if (title.includes("α")) return "alpha";
  if (title.includes("β")) return "beta";
  return "other";
}

function compactPurpose(description: string) {
  if (!description) return "No milestone description has been recorded.";
  const firstLine = description.split("\n")[0];
  return firstLine.replace(/^#\d+\s*\(\d+\):\s*/, "");
}

export function WaveAtlas({ waves }: { waves: WaveRecord[] }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<Family>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const totals = useMemo(() => {
    const issues = waves.flatMap((wave) => wave.members);
    return {
      waves: waves.length,
      issues: issues.length,
      open: issues.filter((issue) => issue.state === "open").length,
      closed: issues.filter((issue) => issue.state === "closed").length,
    };
  }, [waves]);

  const dependencyDesk = useMemo(() => {
    const allIssues = waves.flatMap((wave) =>
      wave.members.map((issue) => ({ ...issue, wave })),
    );
    const dependents = new Map<number, typeof allIssues>();
    for (const candidate of allIssues) {
      for (const dependency of candidate.dependencies) {
        dependents.set(dependency.number, [
          ...(dependents.get(dependency.number) ?? []),
          candidate,
        ]);
      }
    }

    const graphIssues = waves.flatMap((wave) =>
      wave.members
        .filter((issue) => issue.state === "open")
        .map((issue) => ({
          ...issue,
          wave,
          unlocks: dependents.get(issue.number) ?? [],
          ready: issue.dependencies.every(
            (dependency) => dependency.state === "closed",
          ),
        })),
    );
    const ready = graphIssues.filter((issue) => issue.ready);
    const readyWaveNumbers = new Set(ready.map((issue) => issue.wave.number));

    return {
      readyWaves: waves.filter((wave) => readyWaveNumbers.has(wave.number)),
      graphIssues,
      ready,
    };
  }, [waves]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return waves.filter((wave) => {
      if (family === "alpha" && familyOf(wave.title) !== "alpha") return false;
      if (family === "beta" && familyOf(wave.title) !== "beta") return false;
      if (family === "active" && wave.open === 0) return false;
      if (!needle) return true;
      return (
        wave.title.toLowerCase().includes(needle) ||
        wave.description.toLowerCase().includes(needle) ||
        wave.members.some(
          (issue) =>
            `#${issue.number}`.includes(needle) ||
            issue.title.toLowerCase().includes(needle),
        )
      );
    });
  }, [family, query, waves]);

  function toggle(number: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  return (
    <main>
      <header className="masthead">
        <div className="eyebrow">WILDCAT SKILLS · LIVE MILESTONE INDEX</div>
        <div className="title-row">
          <div>
            <h1>Shoggoth Wave Atlas</h1>
            <p className="lede">
              Every delivery wave, its members, and its current state. α and β
              are shown as separate families so identical wave numbers never
              collapse into one queue.
            </p>
          </div>
          <a
            className="repo-link"
            href="https://github.com/wildcat-finance/skills/milestones"
            target="_blank"
            rel="noreferrer"
          >
            Open GitHub milestones ↗
          </a>
        </div>
        <div className="stats" aria-label="Wave totals">
          <div><strong>{totals.waves}</strong><span>waves</span></div>
          <div><strong>{totals.issues}</strong><span>issues</span></div>
          <div><strong>{totals.open}</strong><span>open</span></div>
          <div><strong>{totals.closed}</strong><span>closed</span></div>
        </div>
      </header>

      <section className="controls" aria-label="Wave filters">
        <label className="search-wrap">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Wave, issue number, skill or phrase"
          />
        </label>
        <div className="segmented" role="group" aria-label="Wave family">
          {([
            ["all", "All waves"],
            ["alpha", "α family"],
            ["beta", "β family"],
            ["active", "Open work"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={family === value ? "active" : ""}
              onClick={() => setFamily(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="starter-desk" aria-labelledby="starter-heading">
        <div className="starter-intro">
          <div className="eyebrow">PICK-UP DESK</div>
          <h2 id="starter-heading">Aye, here you go.</h2>
          <p>
            These are every open job across the Atlas whose recorded hard
            dependencies are closed. The public API draws one at random so a
            crowd is spread across the ready pool. Wave order remains
            sequencing advice; it is not silently promoted into a hard edge.
          </p>
          <div className="frontier-tags">
            {dependencyDesk.readyWaves.map((wave) => (
              <a href={wave.url} target="_blank" rel="noreferrer" key={wave.number}>
                {wave.title}
              </a>
            ))}
          </div>
          <a className="api-link" href="/api/job" target="_blank" rel="noreferrer">
            <span>PUBLIC API</span>
            <code>GET /api/job</code>
            <small>Random by default · add ?all=true for the complete pool</small>
          </a>
        </div>

        <div className="ready-grid">
          {dependencyDesk.ready.map((issue) => (
            <a className="ready-card" href={issue.url} target="_blank" rel="noreferrer" key={issue.number}>
              <span className="ready-top"><span>READY</span><strong>#{issue.number}</strong></span>
              <b>{issue.title}</b>
              <small>{issue.wave.title}</small>
              <span className="edge-copy">
                {issue.unlocks.length
                  ? `Unlocks ${issue.unlocks.map((item) => `#${item.number}`).join(", ")}`
                  : "No recorded downstream edge"}
              </span>
            </a>
          ))}
          {dependencyDesk.ready.length === 0 && (
            <div className="no-ready">
              Nothing is dependency-clear yet. The graph below names every
              recorded open dependency.
            </div>
          )}
        </div>

        <div className="dependency-lanes" aria-label="Recorded dependency graph">
          {dependencyDesk.graphIssues.map((issue) => (
            <div className={`dependency-node ${issue.ready ? "ready" : "blocked"}`} key={issue.number}>
              <div>
                <a href={issue.url} target="_blank" rel="noreferrer">#{issue.number}</a>
                <strong>{issue.title}</strong>
              </div>
              <span>
                {issue.dependencies.length
                  ? `needs ${issue.dependencies.map((item) => `#${item.number} ${item.state}`).join(" · ")}`
                  : "no recorded hard prerequisites"}
              </span>
              {issue.unlocks.length > 0 && (
                <span>→ {issue.unlocks.map((item) => `#${item.number}`).join(" · ")}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="wave-list" aria-live="polite">
        <div className="table-head">
          <span>Wave</span><span>Purpose</span><span>Progress</span><span>Members</span>
        </div>
        {visible.map((wave) => {
          const total = wave.open + wave.closed;
          const percentage = total ? Math.round((wave.closed / total) * 100) : 0;
          const isExpanded = expanded.has(wave.number) || Boolean(query.trim());
          return (
            <article className="wave" key={wave.number}>
              <button
                className="wave-summary"
                type="button"
                onClick={() => toggle(wave.number)}
                aria-expanded={isExpanded}
              >
                <span className="wave-name">
                  <span className={`family-mark ${familyOf(wave.title)}`} />
                  <span><strong>{wave.title}</strong><small>Milestone {wave.number}</small></span>
                </span>
                <span className="purpose">{compactPurpose(wave.description)}</span>
                <span className="progress-cell">
                  <span className="progress-copy"><strong>{percentage}%</strong><small>{wave.closed}/{total} closed</small></span>
                  <span className="progress-track"><span style={{ width: `${percentage}%` }} /></span>
                </span>
                <span className="member-count">{wave.members.length}<span aria-hidden="true">{isExpanded ? "−" : "+"}</span></span>
              </button>

              {isExpanded && (
                <div className="wave-detail">
                  <div className="detail-note">
                    <p>{wave.description || "No milestone description has been recorded."}</p>
                    <a href={wave.url} target="_blank" rel="noreferrer">View milestone ↗</a>
                  </div>
                  <div className="issues" role="table" aria-label={`${wave.title} issues`}>
                    {wave.members.map((issue, index) => (
                      <a className="issue-row" href={issue.url} target="_blank" rel="noreferrer" key={issue.number} role="row">
                        <span className="order">{String(index + 1).padStart(2, "0")}</span>
                        <span className="issue-number">#{issue.number}</span>
                        <span className="issue-title">
                          {issue.title}
                          {issue.dependencies.length > 0 && (
                            <small>
                              needs {issue.dependencies.map((item) => `#${item.number}`).join(", ")}
                            </small>
                          )}
                        </span>
                        {issue.score !== null && <span className="score">{issue.score}</span>}
                        <span className={`state ${issue.state}`}>{issue.state}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {visible.length === 0 && (
          <div className="empty">No wave or member matches that search.</div>
        )}
      </section>

      <footer>
        <span>Source: wildcat-finance/skills GitHub milestones</span>
        <span>Data captured when this deployment was built</span>
      </footer>
    </main>
  );
}
