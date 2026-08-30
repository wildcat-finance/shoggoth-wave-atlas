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

// Inspect one generated fallback pair. Returns every problem found rather than
// the first, because a run that fails validation is going to be read by a
// person and one message per run is a slow way to learn what is wrong.
export function inspectSnapshot({ waves, meta }) {
  const problems = [];

  if (!Array.isArray(waves)) {
    fail(problems, "waves-data.json is not an array");
  } else if (waves.length === 0) {
    // An empty wave set is the failure this whole check exists for: it is what
    // a silently truncated or unauthenticated read looks like on disk.
    fail(problems, "waves-data.json contains no waves");
  } else {
    waves.forEach((wave, index) => checkWave(problems, `waves[${index}]`, wave));
  }

  if (!meta || typeof meta !== "object") {
    fail(problems, "waves-meta.json is not an object");
    return { ok: problems.length === 0, problems, waveCount: 0, memberCount: 0, droppedCount: 0 };
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

  const waveList = Array.isArray(waves) ? waves : [];
  return {
    ok: problems.length === 0,
    problems,
    waveCount: waveList.length,
    memberCount: waveList.reduce(
      (total, wave) => total + (Array.isArray(wave?.members) ? wave.members.length : 0),
      0,
    ),
    droppedCount: Array.isArray(meta.dropped) ? meta.dropped.length : 0,
  };
}
