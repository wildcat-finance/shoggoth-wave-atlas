// Validation for the checked-in fallback snapshot.
//
// The fallback is the recovery floor: it answers when the live GitHub read
// cannot. A floor that has quietly become empty, undated, or unattributed is
// worse than an outage, because it still looks like an answer. Nothing is
// published unless it passes here.

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function fail(problems, message) {
  problems.push(message);
}

function checkDependency(problems, where, value) {
  if (!value || typeof value !== "object") {
    fail(problems, `${where} is not an object`);
    return;
  }
  const dependency = value;
  if (!Number.isInteger(dependency.number)) fail(problems, `${where}.number is not an integer`);
  if (typeof dependency.title !== "string") fail(problems, `${where}.title is not a string`);
  if (!["open", "closed", "unknown"].includes(String(dependency.state))) {
    fail(problems, `${where}.state is not open, closed, or unknown`);
  }
  if (typeof dependency.url !== "string") fail(problems, `${where}.url is not a string`);
}

function checkMember(problems, where, value) {
  if (!value || typeof value !== "object") {
    fail(problems, `${where} is not an object`);
    return;
  }
  const issue = value;
  if (!Number.isInteger(issue.number)) fail(problems, `${where}.number is not an integer`);
  if (typeof issue.title !== "string") fail(problems, `${where}.title is not a string`);
  if (!["open", "closed"].includes(String(issue.state))) {
    fail(problems, `${where}.state is not open or closed`);
  }
  if (typeof issue.url !== "string") fail(problems, `${where}.url is not a string`);
  if (typeof issue.score !== "number" && issue.score !== null) {
    fail(problems, `${where}.score is not a number or null`);
  }
  if (!["fiat", "pull_request", "invalid"].includes(String(issue.execution_mode))) {
    fail(problems, `${where}.execution_mode is not fiat, pull_request, or invalid`);
  }
  if (issue.execution_mode === "invalid" && typeof issue.execution_reason !== "string") {
    fail(problems, `${where}.execution_reason is not a string`);
  }
  if (!Array.isArray(issue.dependencies)) {
    fail(problems, `${where}.dependencies is not an array`);
    return;
  }
  issue.dependencies.forEach((dependency, index) => {
    checkDependency(problems, `${where}.dependencies[${index}]`, dependency);
  });
}

function checkWave(problems, where, value) {
  if (!value || typeof value !== "object") {
    fail(problems, `${where} is not an object`);
    return;
  }
  const wave = value;
  if (!Number.isInteger(wave.number)) fail(problems, `${where}.number is not an integer`);
  if (typeof wave.title !== "string") fail(problems, `${where}.title is not a string`);
  if (typeof wave.description !== "string") fail(problems, `${where}.description is not a string`);
  if (!["open", "closed"].includes(String(wave.state))) {
    fail(problems, `${where}.state is not open or closed`);
  }
  if (!Number.isInteger(wave.open)) fail(problems, `${where}.open is not an integer`);
  if (!Number.isInteger(wave.closed)) fail(problems, `${where}.closed is not an integer`);
  if (typeof wave.url !== "string") fail(problems, `${where}.url is not a string`);
  if (!Array.isArray(wave.members)) {
    fail(problems, `${where}.members is not an array`);
    return;
  }
  wave.members.forEach((member, index) => {
    checkMember(problems, `${where}.members[${index}]`, member);
  });
}

function checkDropped(problems, where, value) {
  if (!value || typeof value !== "object") {
    fail(problems, `${where} is not an object`);
    return;
  }
  const issue = value;
  if (!Number.isInteger(issue.number)) fail(problems, `${where}.number is not an integer`);
  if (typeof issue.title !== "string") fail(problems, `${where}.title is not a string`);
  if (typeof issue.url !== "string") fail(problems, `${where}.url is not a string`);
}

function membersOf(waves) {
  return (Array.isArray(waves) ? waves : []).reduce(
    (total, wave) => total + (Array.isArray(wave?.members) ? wave.members.length : 0),
    0,
  );
}

// How far the issue count may fall in one refresh before the result is treated
// as a bad read rather than a quiet week. Skills closes issues continuously;
// it does not lose half its backlog between two runs.
const COLLAPSE_RATIO = 0.5;

// Inspect one generated fallback pair. Returns every problem found rather than
// the first, because a run that fails validation is going to be read by a
// person and one message per run is a slow way to learn what is wrong.
//
// `baseline` is the wave list this one would replace, when there is one. A
// snapshot can be perfectly well-formed and still be wrong: the failure that
// prompted this argument produced fourteen valid waves containing no issues at
// all, which every structural check below happily accepted.
export function inspectSnapshot({ waves, meta, baseline }) {
  const problems = [];

  if (!Array.isArray(waves)) {
    fail(problems, "waves-data.json is not an array");
  } else if (waves.length === 0) {
    // An empty wave set is one failure this check exists for: it is what a
    // silently truncated or narrowed read looks like on disk.
    fail(problems, "waves-data.json contains no waves");
  } else {
    waves.forEach((wave, index) => checkWave(problems, `waves[${index}]`, wave));
  }

  const memberCount = membersOf(waves);
  if (Array.isArray(waves) && waves.length > 0 && memberCount === 0) {
    // Waves without issues is the other shape of the same failure, and the
    // more dangerous one: it looks like a snapshot, validates like a snapshot,
    // and leaves the Atlas with nothing to offer when the live read is down.
    fail(problems, "waves-data.json contains no issues at all");
  }

  const baselineCount = membersOf(baseline);
  if (baselineCount > 0 && memberCount < baselineCount * COLLAPSE_RATIO) {
    fail(
      problems,
      `waves-data.json would fall from ${baselineCount} issues to ${memberCount}; ` +
        "refusing a collapse this large without a human deciding it is real",
    );
  }

  if (!meta || typeof meta !== "object") {
    fail(problems, "waves-meta.json is not an object");
    return {
      ok: false,
      problems,
      waveCount: Array.isArray(waves) ? waves.length : 0,
      memberCount,
      droppedCount: 0,
    };
  }

  if (typeof meta.source_revision !== "string" || !SHA_PATTERN.test(meta.source_revision)) {
    fail(problems, "waves-meta.json source_revision is not a full 40-character SHA");
  }
  if (typeof meta.generated_at !== "string" || !Number.isFinite(Date.parse(meta.generated_at))) {
    fail(problems, "waves-meta.json generated_at is not a parseable timestamp");
  }
  // `dropped` must be present even when empty. Absent, a fallback answer
  // reports an empty inventory, which reads as "nothing is hidden" when what
  // it means is "this snapshot cannot say".
  if (!Array.isArray(meta.dropped)) {
    fail(problems, "waves-meta.json has no explicit dropped array");
  } else {
    meta.dropped.forEach((issue, index) => checkDropped(problems, `dropped[${index}]`, issue));
  }

  return {
    ok: problems.length === 0,
    problems,
    waveCount: Array.isArray(waves) ? waves.length : 0,
    memberCount,
    droppedCount: Array.isArray(meta.dropped) ? meta.dropped.length : 0,
  };
}
