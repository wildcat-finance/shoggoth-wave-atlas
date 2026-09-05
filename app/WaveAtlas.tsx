"use client";

import { useMemo, useState } from "react";

type IssueRecord = {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  score: number | null;
  execution_mode: "fiat" | "pull_request" | "invalid";
  execution_reason?: string;
  dependencies: Array<{
    number: number;
    title: string;
    state: "open" | "closed" | "unknown";
    url: string;
  }>;
};

export type AtlasIssueRecord = {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  labels: string[];
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

// Waves are a single numbered sequence now. The α and β families are retired,
// so nothing here sorts, filters or colours by one.
type View = "all" | "active";
type DeskMode = "all" | "fiat" | "pull_request" | "invalid";

const executionLabels = {
  fiat: "Fiat run",
  pull_request: "PR job",
  invalid: "Invalid metadata",
} as const;

function compactPurpose(description: string) {
  if (!description) return "No milestone description has been recorded.";
  const firstLine = description.split("\n")[0];
  return firstLine.replace(/^#\d+\s*\(\d+\):\s*/, "");
}

type Provenance = {
  source: "live" | "cache" | "snapshot";
  generatedAt: string;
  sourceRevision: string;
  buildRevision: string;
  readError?: string;
};

type MaintenanceProvenance = {
  source: "live" | "cache" | "unavailable";
  generatedAt: string;
  readError?: string;
};

export function WaveAtlas({
  waves,
  atlasIssues,
  provenance,
  maintenanceProvenance,
}: {
  waves: WaveRecord[];
  atlasIssues: AtlasIssueRecord[];
  provenance: Provenance;
  maintenanceProvenance: MaintenanceProvenance;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [deskWave, setDeskWave] = useState<number | null>(null);
  const [deskMode, setDeskMode] = useState<DeskMode>("all");
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
    const selectableReady = graphIssues.filter(
      (issue) => issue.ready && issue.execution_mode !== "invalid",
    );
    const invalid = graphIssues.filter((issue) => issue.execution_mode === "invalid");
    const byMode = deskMode === "all"
      ? selectableReady
      : deskMode === "invalid"
        ? invalid
        : selectableReady.filter((issue) => issue.execution_mode === deskMode);
    const readyWaveNumbers = new Set(byMode.map((issue) => issue.wave.number));
    const inWave = (issue: { wave: WaveRecord }) =>
      deskWave === null || issue.wave.number === deskWave;

    return {
      // The tag row always offers every ready wave, so a chosen filter can be
      // swapped for another without clearing it first.
      readyWaves: waves.filter((wave) => readyWaveNumbers.has(wave.number)),
      graphIssues: graphIssues.filter(inWave),
      displayed: byMode.filter(inWave),
      readyTotal: selectableReady.length,
      counts: {
        fiat: selectableReady.filter((issue) => issue.execution_mode === "fiat").length,
        pull_request: selectableReady.filter((issue) => issue.execution_mode === "pull_request").length,
        invalid: invalid.length,
      },
    };
  }, [deskMode, deskWave, waves]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return waves.filter((wave) => {
      if (view === "active" && wave.open === 0) return false;
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
  }, [query, view, waves]);

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
              Every delivery wave, its members, and its current state. One
              numbered sequence, ordered by wave number, with the waves that
              still hold open work marked. Work on the Atlas itself sits in a
              separate maintenance category below.
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

      <section className="atlas-maintenance" aria-labelledby="atlas-maintenance-heading">
        <div className="maintenance-intro">
          <div className="eyebrow">ATLAS MAINTENANCE · SEPARATE CATEGORY</div>
          <h2 id="atlas-maintenance-heading">Work on the map itself.</h2>
          <p>
            Open issues from the Wave Atlas repository live here. They are not
            Wildcat Skills waves, do not change the wave totals below, and are
            never offered by <code>GET /api/job</code>.
          </p>
        </div>
        <div className="maintenance-summary" aria-label="Atlas maintenance status">
          <strong>
            {maintenanceProvenance.source === "unavailable"
              ? "—"
              : atlasIssues.length}
          </strong>
          <span>open Atlas issues</span>
          <small>
            Data: {maintenanceProvenance.source} · observed{" "}
            {maintenanceProvenance.generatedAt}
          </small>
          <a
            href="https://github.com/wildcat-finance/shoggoth-wave-atlas/issues"
            target="_blank"
            rel="noreferrer"
          >
            Open maintenance queue ↗
          </a>
        </div>
        <div className="maintenance-grid">
          {atlasIssues.map((issue) => (
            <a
              className="maintenance-card"
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              key={issue.number}
            >
              <span className="maintenance-card-top">
                <span>ATLAS</span>
                <strong>#{issue.number}</strong>
              </span>
              <b>{issue.title}</b>
              <span className="maintenance-labels">
                {issue.labels.length > 0
                  ? issue.labels.map((label) => <span key={label}>{label}</span>)
                  : <span>unlabelled</span>}
              </span>
              <small>Updated {issue.updatedAt.slice(0, 10)}</small>
            </a>
          ))}
          {maintenanceProvenance.source === "unavailable" && (
            <div className="maintenance-empty">
              The Atlas maintenance queue could not be read. Skills waves
              remain available below.
            </div>
          )}
          {maintenanceProvenance.source !== "unavailable" && atlasIssues.length === 0 && (
            <div className="maintenance-empty">No open Atlas maintenance issues.</div>
          )}
        </div>
      </section>

      <section className="controls" aria-label="Wave filters">
        <label className="search-wrap">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Wave, issue number, skill or phrase"
          />
        </label>
        <div className="segmented" role="group" aria-label="Wave view">
          {([
            ["all", "All waves"],
            ["active", "Open work"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={view === value ? "active" : ""}
              onClick={() => setView(value)}
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
            Fiat runs and ordinary pull-request jobs are separate ready pools.
            The public API selects only work with an exact execution marker and
            closed hard dependencies. Invalid metadata remains visible for
            repair, but is never offered as a job.
          </p>
          <div className="desk-modes" role="group" aria-label="Filter by execution mode">
            {([
              ["all", "All ready", dependencyDesk.readyTotal],
              ["fiat", "Fiat runs", dependencyDesk.counts.fiat],
              ["pull_request", "PR jobs", dependencyDesk.counts.pull_request],
              ["invalid", "Invalid metadata", dependencyDesk.counts.invalid],
            ] as const).map(([mode, label, count]) => (
              <button
                type="button"
                className={deskMode === mode ? "active" : ""}
                aria-pressed={deskMode === mode}
                onClick={() => {
                  setDeskMode(mode);
                  setDeskWave(null);
                }}
                key={mode}
              >
                <span>{label}</span><strong>{count}</strong>
              </button>
            ))}
          </div>
          <div className="frontier-tags" role="group" aria-label="Filter the ready pool by wave">
            {deskWave !== null && (
              <button
                type="button"
                className="frontier-clear"
                onClick={() => setDeskWave(null)}
              >
                Clear wave filter
              </button>
            )}
            {dependencyDesk.readyWaves.map((wave) => (
              <span
                className={`frontier-tag ${deskWave === wave.number ? "active" : ""}`}
                key={wave.number}
              >
                <button
                  type="button"
                  aria-pressed={deskWave === wave.number}
                  onClick={() =>
                    setDeskWave(deskWave === wave.number ? null : wave.number)
                  }
                >
                  {wave.title}
                </button>
                <a
                  href={wave.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open the ${wave.title} milestone on GitHub`}
                  title="Open the milestone on GitHub"
                >
                  ↗
                </a>
              </span>
            ))}
          </div>
          <a className="api-link" href="/api/job" target="_blank" rel="noreferrer">
            <span>PUBLIC API</span>
            <code>GET /api/job</code>
            <small>Use ?kind=fiat or ?kind=pull_request · add ?all=true for a pool</small>
          </a>
        </div>

        <div className="ready-grid">
          {dependencyDesk.displayed.map((issue) => (
            <a className="ready-card" href={issue.url} target="_blank" rel="noreferrer" key={issue.number}>
              <span className="ready-top">
                <span>{issue.execution_mode === "invalid" ? "NEEDS METADATA" : "READY"}</span>
                <strong>#{issue.number}</strong>
              </span>
              <span className={`execution-badge ${issue.execution_mode}`}>
                {executionLabels[issue.execution_mode]}
              </span>
              <b>{issue.title}</b>
              <small>{issue.wave.title}</small>
              <span className="edge-copy">
                {issue.execution_mode === "invalid"
                  ? issue.execution_reason
                  : issue.unlocks.length
                  ? `Unlocks ${issue.unlocks.map((item) => `#${item.number}`).join(", ")}`
                  : "No recorded downstream edge"}
              </span>
            </a>
          ))}
          {dependencyDesk.displayed.length === 0 && (
            <div className="no-ready">
              Nothing matches this execution and wave filter. The graph below
              still names every open issue and recorded dependency.
            </div>
          )}
        </div>

        <div className="dependency-lanes" aria-label="Recorded dependency graph">
          {dependencyDesk.graphIssues.map((issue) => (
            <div className={`dependency-node ${issue.ready ? "ready" : "blocked"} ${issue.execution_mode}`} key={issue.number}>
              <div>
                <a href={issue.url} target="_blank" rel="noreferrer">#{issue.number}</a>
                <strong>{issue.title}</strong>
                <span className={`execution-badge ${issue.execution_mode}`}>
                  {executionLabels[issue.execution_mode]}
                </span>
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
                  <span
                    className={`wave-mark ${wave.open > 0 ? "live" : "done"}`}
                    aria-hidden="true"
                  />
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
                          <span className={`execution-badge ${issue.execution_mode}`}>
                            {executionLabels[issue.execution_mode]}
                          </span>
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
        <span>Sources: Skills milestones · Wave Atlas issues</span>
        <span>Data: {provenance.source} · observed {provenance.generatedAt}</span>
        <span>
          Atlas issues: {maintenanceProvenance.source} · observed{" "}
          {maintenanceProvenance.generatedAt}
        </span>
        <a
          href={`https://github.com/wildcat-finance/skills/commit/${provenance.sourceRevision}`}
          target="_blank"
          rel="noreferrer"
        >
          Skills revision {provenance.sourceRevision.slice(0, 12)}
        </a>
        <a
          href={`https://github.com/wildcat-finance/shoggoth-wave-atlas/commit/${provenance.buildRevision}`}
          target="_blank"
          rel="noreferrer"
        >
          Atlas build {provenance.buildRevision.slice(0, 12)}
        </a>
        {provenance.source === "snapshot" && (
          <span>Live GitHub read failed; this is a snapshot fallback.</span>
        )}
      </footer>
    </main>
  );
}
