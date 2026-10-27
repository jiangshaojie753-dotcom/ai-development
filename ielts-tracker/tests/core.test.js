import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  validateTask,
  validateSession,
  parseReport,
  importReport,
  backup,
  restore,
  analytics,
  stageEvidence,
  saveState,
  loadState,
  csv,
} from "../core.js";
// All fixtures are synthetic, unrelated to any user's actual learning report.
const fixture = (overrides = {}) => ({
  schemaVersion: 1,
  reportId: "synthetic-a",
  date: "2000-01-01",
  sessions: [
    {
      skill: "listening",
      source: "synthetic-series",
      questionType: "choice",
      difficulty: "A",
      timed: true,
      firstAttempt: true,
      correct: 3,
      total: 8,
    },
  ],
  ...overrides,
});
const insert = (state, v) => importReport(state, parseReport(v)).state;
const session = (overrides = {}) =>
  validateSession({
    date: "2000-01-01",
    skill: "listening",
    source: "synthetic-series",
    questionType: "choice",
    difficulty: "A",
    timed: true,
    firstAttempt: true,
    correct: 3,
    total: 8,
    ...overrides,
  });
test("new users have no records, scores, assumed duration or stage evidence", () => {
  const s = emptyState();
  assert.equal(s.sessions.length, 0);
  const a = analytics(s, "2000-01-01", 7);
  assert.equal(a.completion, null);
  assert.equal(a.daily[6].minutes, null);
  assert.equal(stageEvidence(s, "listening", "2000-01-01").ready, false);
});
test("versioned import preserves null, preview is pure, duplicate reports and changed IDs do not add rows", () => {
  const original = emptyState(),
    report = parseReport(fixture()),
    result = importReport(original, report);
  assert.equal(original.sessions.length, 0);
  assert.equal(result.state.sessions[0].minutes, null);
  assert.equal(result.state.sessions[0].band, null);
  assert.equal(
    importReport(result.state, parseReport(fixture())).duplicate,
    true,
  );
  assert.equal(
    importReport(result.state, parseReport(fixture({ reportId: "new-id" })))
      .duplicate,
    true,
  );
  assert.equal(
    importReport(
      result.state,
      parseReport(
        fixture({
          reportId: "new-id",
          sessions: [{ ...fixture().sessions[0], id: "different-id" }],
        }),
      ),
    ).duplicate,
    true,
  );
});
test("same report ID with changed content requires correction, rather than hiding conflicting data", () => {
  const s = insert(emptyState(), fixture());
  assert.throws(
    () => importReport(s, parseReport(fixture({ date: "2000-01-02" }))),
    /内容发生变化/,
  );
});
test("rows duplicated across reports and within a report are deduplicated", () => {
  const v = fixture();
  v.sessions.push({ ...v.sessions[0] });
  const s = insert(emptyState(), v);
  assert.equal(s.sessions.length, 1);
  const next = insert(s, {
    ...fixture({ reportId: "synthetic-b" }),
    tasks: [{ skill: "reading", title: "synthetic task" }],
  });
  assert.equal(next.sessions.length, 1);
  assert.equal(next.tasks.length, 1);
});
test("legacy adapter preserves unknown metrics, accepts question count, rejects undocumented guesses", () => {
  const report = parseReport({
    date: "2000-01-01",
    listening: { correct: 3, total: 8 },
    speaking: { questions: 2 },
  });
  assert.equal(report.sessions[0].minutes, null);
  assert.equal(report.sessions[0].timed, null);
  assert.equal(report.sessions[1].questions, 2);
  assert.throws(
    () => parseReport({ date: "2000-01-01", speaking: { pronunciation: 7 } }),
    /未知字段/,
  );
});
test("strict validation rejects invalid dates, types, contradictory marks, unsupported versions and manufactured bands", () => {
  for (const bad of [
    { date: "2000-02-30" },
    { schemaVersion: 2 },
    { sessions: [{ skill: "reading", correct: 9, total: 8 }] },
    { sessions: [{ skill: "reading", correct: "3", total: 8 }] },
    { sessions: [{ skill: "reading", minutes: -1 }] },
    { sessions: [{ skill: "speaking", scoreType: "practice", band: 6 }] },
    { sessions: [{ skill: "writing", scoreType: "mock", timed: false }] },
    { sessions: [{ skill: "reading", total: 8 }] },
    { sessions: [{ skill: "writing", dimensions: { grammar: 6 } }] },
  ])
    assert.throws(() => parseReport(fixture(bad)));
  assert.throws(
    () => parseReport({ schemaVersion: 1, date: "2000-01-01" }),
    /报告为空/,
  );
});
test("AI estimate is labelled and never treated as comparable objective data", () => {
  const s = emptyState();
  s.sessions = [
    session({
      skill: "speaking",
      correct: null,
      total: null,
      questions: 2,
      scoreType: "ai_estimate",
      band: 5.5,
    }),
  ];
  assert.equal(analytics(s, "2000-01-01", 7).trends.length, 0);
  assert.equal(s.sessions[0].scoreType, "ai_estimate");
});
test("recurrences across speaking and writing aggregate, re-open mastered errors, and remain idempotent", () => {
  const error = {
    skill: "speaking",
    original: "Synthetic sentence wrong.",
    corrected: "Synthetic sentence corrected.",
    category: "grammar",
    explanation: "Synthetic feedback",
  };
  let s = insert(emptyState(), {
    schemaVersion: 1,
    date: "2000-01-01",
    reportId: "error-a",
    errors: [error],
  });
  s.errors[0].status = "mastered";
  s = insert(s, {
    schemaVersion: 1,
    date: "2000-01-02",
    reportId: "error-b",
    errors: [{ ...error, skill: "writing" }],
  });
  assert.equal(s.errors.length, 1);
  assert.equal(s.errors[0].occurrences.length, 2);
  assert.equal(s.errors[0].status, "review");
  assert.equal(
    insert(s, {
      schemaVersion: 1,
      date: "2000-01-02",
      reportId: "error-b",
      errors: [{ ...error, skill: "writing" }],
    }).errors[0].occurrences.length,
    2,
  );
});
test("full backup round trip preserves error IDs, mastery, imports, stage history, reviews and nulls", () => {
  let s = insert(
    emptyState(),
    fixture({
      errors: [
        {
          skill: "writing",
          original: "Synthetic A",
          corrected: "Synthetic B",
          category: "natural",
        },
      ],
    }),
  );
  s.errors[0].status = "mastered";
  s.reviews = [
    {
      id: "synthetic-review",
      date: "2000-01-01",
      summary: "Synthetic reflection",
      adjustments: "Synthetic adjustment",
    },
  ];
  s.stages.writing = {
    level: 2,
    changedOn: "2000-01-01",
    history: [
      { date: "2000-01-01", from: 1, to: 2, reason: "Synthetic evidence" },
    ],
  };
  const restored = restore(JSON.stringify(backup(s)));
  assert.deepEqual(restored, s);
  assert.equal(
    importReport(
      restored,
      parseReport(
        fixture({
          errors: [
            {
              skill: "writing",
              original: "Synthetic A",
              corrected: "Synthetic B",
              category: "natural",
            },
          ],
        }),
      ),
    ).duplicate,
    true,
  );
});
test("invalid or partial backup cannot silently erase local state", () => {
  const s = insert(emptyState(), fixture());
  const b = backup(s);
  b.data.sessions[0].date = "bad";
  assert.throws(() => restore(b));
  assert.equal(s.sessions.length, 1);
  assert.throws(() =>
    restore({ app: "ielts-tracker", backupVersion: 99, data: s }),
  );
  const duplicate = backup(s);
  duplicate.data.sessions.push({ ...duplicate.data.sessions[0] });
  assert.throws(() => restore(duplicate), /重复 id/);
});
test("persist and reload preserve records; corrupt storage is rejected", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
    };
  const s = insert(emptyState(), fixture());
  saveState(storage, s);
  assert.deepEqual(loadState(storage), s);
  data.set("ielts-tracker:v1", "broken");
  assert.throws(() => loadState(storage));
});
test("7/30/90 windows, year and leap boundaries; no double counting task/session minutes", () => {
  const s = emptyState();
  s.tasks = [
    validateTask({
      date: "2000-03-01",
      skill: "listening",
      title: "synthetic",
      actualMinutes: 12,
      plannedMinutes: 20,
      completed: true,
    }),
  ];
  s.sessions = [
    session({ date: "2000-03-01", minutes: 12 }),
    session({ date: "2000-02-29", minutes: 7 }),
    session({ date: "2000-02-20", minutes: 5 }),
    session({ date: "1999-12-20", minutes: 11 }),
    session({ date: "2000-03-02", minutes: 100 }),
  ];
  assert.equal(analytics(s, "2000-03-01", 7).totalMinutes, 19);
  assert.equal(analytics(s, "2000-03-01", 30).totalMinutes, 24);
  assert.equal(analytics(s, "2000-03-01", 90).totalMinutes, 35);
  assert.equal(analytics(s, "2000-03-01", 7).completion, 1);
  s.tasks[0].actualMinutes = null;
  assert.equal(analytics(s, "2000-03-01", 7).totalMinutes, 7);
  assert.equal(analytics(s, "2000-03-01", 7).unknown, 1);
});
test("comparison splits difficulty, timing, source, question type, score type and denominator; unknown and repeats excluded", () => {
  const s = emptyState();
  s.sessions = [
    session(),
    session({ date: "2000-01-02" }),
    session({ date: "2000-01-02", difficulty: "B" }),
    session({ timed: false }),
    session({ source: "different-series" }),
    session({ questionType: "gap" }),
    session({ scoreType: "mock" }),
    session({ total: 10 }),
    session({ timed: null }),
    session({ firstAttempt: false }),
  ];
  const a = analytics(s, "2000-01-02", 7);
  assert.equal(a.trends.length, 7);
  assert.equal(a.trends.filter((g) => g.rows.length === 2).length, 1);
  assert.equal(a.excluded, 2);
});
test("stage recommendation requires time, at least three dates, comparable conditions and improvement", () => {
  const s = emptyState();
  s.sessions = [
    session({ date: "2000-01-01", correct: 2 }),
    session({ date: "2000-01-12", correct: 4 }),
    session({ date: "2000-01-14", correct: 6 }),
  ];
  assert.equal(stageEvidence(s, "listening", "2000-01-14").ready, true);
  assert.equal(stageEvidence(s, "listening", "2000-01-13").ready, false);
  s.sessions[2].difficulty = "B";
  assert.equal(stageEvidence(s, "listening", "2000-01-14").ready, false);
});
test("CSV escapes quotes, nulls, line breaks and spreadsheet formulas", () => {
  const s = emptyState();
  s.tasks = [
    validateTask({
      date: "2000-01-01",
      skill: "reading",
      title: '=SYNTHETIC("x")',
      notes: "a\nb",
    }),
  ];
  const text = csv(s);
  assert.ok(text.includes("'=SYNTHETIC"));
  assert.ok(text.includes('"a\nb"'));
  assert.ok(!text.includes("null"));
});
test("daily completion trend distinguishes unplanned days from zero-completion days", () => {
  const s = emptyState();
  s.tasks = [
    validateTask({
      date: "2000-01-01",
      skill: "writing",
      title: "Synthetic A",
      completed: false,
    }),
    validateTask({
      date: "2000-01-02",
      skill: "reading",
      title: "Synthetic B",
      completed: true,
    }),
  ];
  const a = analytics(s, "2000-01-03", 7);
  assert.equal(a.daily[4].completion, 0);
  assert.equal(a.daily[5].completion, 1);
  assert.equal(a.daily[6].completion, null);
  assert.equal(a.completion, 0.5);
});
