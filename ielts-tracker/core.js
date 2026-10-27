// Pure domain logic shared by the browser and node:test. No network or demo records.
export const SKILLS = ["listening", "reading", "speaking", "writing"];
export const LABELS = {
  listening: "听力",
  reading: "阅读",
  speaking: "口语",
  writing: "写作",
};
export const SCORE_LABELS = {
  practice: "练习成绩",
  mock: "正式计时模考",
  ai_estimate: "AI 估计 · 仅供参考",
};
export const CATEGORIES = {
  grammar: "语法错误",
  collocation: "词语搭配",
  natural: "更自然表达",
  other: "其他",
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const uid = () => globalThis.crypto.randomUUID();
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const object = (v, path) =>
  assert(v && typeof v === "object" && !Array.isArray(v), `${path} 必须是对象`);
function keys(v, allowed, path) {
  object(v, path);
  for (const k of Object.keys(v))
    assert(allowed.includes(k), `${path}.${k} 是未知字段，请按格式说明更正`);
}
function str(v, path, required = false, max = 10000) {
  if (v == null && !required) return "";
  assert(
    typeof v === "string" && v.length <= max && (!required || v.trim()),
    `${path} 必须是${required ? "非空" : ""}文本（文本过长或类型不符）`,
  );
  return v.trim();
}
function num(v, path, max = 1440, integer = false) {
  if (v == null) return null;
  assert(
    typeof v === "number" &&
      Number.isFinite(v) &&
      v >= 0 &&
      v <= max &&
      (!integer || Number.isInteger(v)),
    `${path} 必须是 0–${max} 的${integer ? "整数" : "数字"}或 null`,
  );
  return v;
}
function bool(v, path) {
  assert(
    v == null || typeof v === "boolean",
    `${path} 必须是 true、false 或 null`,
  );
  return v ?? null;
}
function choice(v, values, path) {
  assert(values.includes(v), `${path} 必须是 ${values.join(" / ")}`);
  return v;
}
export function date(v, path = "日期") {
  assert(
    typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    `${path} 必须是真实日期 YYYY-MM-DD`,
  );
  return v;
}
const array = (v, path) => {
  assert(
    Array.isArray(v) && v.length <= 10000,
    `${path} 必须是数组（最多 10000 条）`,
  );
  return v;
};
const id = (v, path) => (v == null ? uid() : str(v, path, true));
const taskFields = [
  "id",
  "date",
  "skill",
  "title",
  "plannedMinutes",
  "actualMinutes",
  "completed",
  "notes",
];
export function validateTask(v, fallbackDate) {
  keys(v, taskFields, "task");
  return {
    id: id(v.id, "task.id"),
    date: date(v.date ?? fallbackDate),
    skill: choice(v.skill, SKILLS, "task.skill"),
    title: str(v.title, "task.title", true),
    plannedMinutes: num(v.plannedMinutes, "task.plannedMinutes"),
    actualMinutes: num(v.actualMinutes, "task.actualMinutes"),
    completed:
      v.completed === undefined
        ? false
        : choice(v.completed, [true, false], "task.completed"),
    notes: str(v.notes, "task.notes"),
  };
}
const sessionFields = [
  "id",
  "date",
  "skill",
  "source",
  "questionType",
  "difficulty",
  "timed",
  "firstAttempt",
  "scoreType",
  "correct",
  "total",
  "minutes",
  "band",
  "questions",
  "topic",
  "feedback",
  "writingTask",
  "dimensions",
  "improvements",
];
export function validateSession(v, fallbackDate) {
  keys(v, sessionFields, "session");
  const s = {
    id: id(v.id, "session.id"),
    date: date(v.date ?? fallbackDate),
    skill: choice(v.skill, SKILLS, "session.skill"),
    source: str(v.source, "session.source"),
    questionType: str(v.questionType, "session.questionType"),
    difficulty: str(v.difficulty, "session.difficulty"),
    timed: bool(v.timed, "session.timed"),
    firstAttempt: bool(v.firstAttempt, "session.firstAttempt"),
    scoreType: choice(
      v.scoreType ?? "practice",
      Object.keys(SCORE_LABELS),
      "session.scoreType",
    ),
    correct: num(v.correct, "session.correct", 1000, true),
    total: num(v.total, "session.total", 1000, true),
    minutes: num(v.minutes, "session.minutes"),
    band: num(v.band, "session.band", 9),
    questions: num(v.questions, "session.questions", 1000, true),
    topic: str(v.topic, "session.topic"),
    feedback: str(v.feedback, "session.feedback"),
    writingTask:
      v.writingTask == null
        ? null
        : choice(v.writingTask, ["task1", "task2"], "session.writingTask"),
    dimensions: null,
    improvements: str(v.improvements, "session.improvements"),
  };
  assert(
    (s.correct === null && s.total === null) ||
      (s.correct !== null &&
        s.total !== null &&
        s.total > 0 &&
        s.correct <= s.total),
    "correct 和 total 须同时填写，且 0 ≤ correct ≤ total、total > 0",
  );
  assert(
    s.scoreType !== "mock" || s.timed === true,
    "正式计时模考必须 timed: true",
  );
  assert(
    s.scoreType !== "practice" || s.band === null,
    "练习成绩不可填写 Band；请使用 AI 估计或正式计时模考",
  );
  assert(
    !["speaking", "writing"].includes(s.skill) || s.correct === null,
    "口语/写作不使用正确题数",
  );
  assert(
    s.skill === "speaking" || s.questions === null,
    "questions 只适用于口语",
  );
  assert(
    s.skill === "writing" || (s.writingTask === null && v.dimensions == null),
    "writingTask / dimensions 只适用于写作",
  );
  if (v.dimensions != null) {
    keys(
      v.dimensions,
      ["taskResponse", "coherence", "lexical", "grammar"],
      "dimensions",
    );
    assert(
      s.scoreType !== "practice" ||
        Object.values(v.dimensions).every((x) => x == null),
      "写作 Band 维度评分请标为 AI 估计或正式模考",
    );
    s.dimensions = Object.fromEntries(
      ["taskResponse", "coherence", "lexical", "grammar"].map((k) => [
        k,
        num(v.dimensions[k], `dimensions.${k}`, 9),
      ]),
    );
  }
  return s;
}
const errorFields = [
  "id",
  "date",
  "skill",
  "original",
  "corrected",
  "category",
  "explanation",
];
export function validateError(v, fallbackDate) {
  keys(v, errorFields, "error");
  return {
    id: id(v.id, "error.id"),
    date: date(v.date ?? fallbackDate),
    skill: choice(v.skill, SKILLS, "error.skill"),
    original: str(v.original, "error.original", true),
    corrected: str(v.corrected, "error.corrected", true),
    category: choice(v.category, Object.keys(CATEGORIES), "error.category"),
    explanation: str(v.explanation, "error.explanation"),
  };
}
export function emptyState() {
  return {
    schemaVersion: 1,
    tasks: [],
    sessions: [],
    errors: [],
    imports: [],
    reviews: [],
    stages: Object.fromEntries(
      SKILLS.map((k) => [k, { level: 1, changedOn: null, history: [] }]),
    ),
  };
}
export function identity(v) {
  const { id: _id, ...rest } = v;
  return canonical(rest);
}
export function errorKey(v) {
  return canonical([
    v.original.trim().toLowerCase(),
    v.corrected.trim().toLowerCase(),
    v.category,
  ]);
}
// Explicit, documented legacy adapter; never distributes global minutes across skills.
function legacy(v) {
  keys(
    v,
    [
      "date",
      "reportId",
      "listening",
      "reading",
      "speaking",
      "writing",
      "tasks",
      "errors",
    ],
    "旧版报告",
  );
  date(v.date);
  const sessions = SKILLS.filter((k) => v[k] != null).map((skill) => {
    keys(
      v[skill],
      sessionFields.filter((k) => !["skill", "date"].includes(k)),
      `旧版.${skill}`,
    );
    return { ...v[skill], skill, date: v.date };
  });
  return {
    schemaVersion: 1,
    reportId: v.reportId,
    date: v.date,
    tasks: v.tasks ?? [],
    sessions,
    errors: v.errors ?? [],
  };
}
export function parseReport(input) {
  let v =
    typeof input === "string"
      ? JSON.parse(
          input.replace(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/, "$1"),
        )
      : clone(input);
  const warnings = [];
  if (v?.schemaVersion === undefined) {
    v = legacy(v);
    warnings.push("已转换旧版简化报告；缺失时长、成绩及条件保留为空。");
  }
  keys(
    v,
    ["schemaVersion", "reportId", "date", "tasks", "sessions", "errors"],
    "报告",
  );
  assert(v.schemaVersion === 1, "不支持的 schemaVersion；目前仅支持 1");
  date(v.date);
  const tasks = array(v.tasks ?? [], "tasks").map((x) =>
    validateTask(x, v.date),
  );
  const sessions = array(v.sessions ?? [], "sessions").map((x) =>
    validateSession(x, v.date),
  );
  const errors = array(v.errors ?? [], "errors").map((x) =>
    validateError(x, v.date),
  );
  assert(
    tasks.length + sessions.length + errors.length > 0,
    "报告为空；至少提供一条任务、训练或纠错",
  );
  const contentKey = canonical({
    date: v.date,
    tasks: tasks.map(identity).sort(),
    sessions: sessions.map(identity).sort(),
    errors: errors.map(identity).sort(),
  });
  return {
    schemaVersion: 1,
    reportId: v.reportId == null ? null : str(v.reportId, "reportId", true),
    date: v.date,
    tasks,
    sessions,
    errors,
    contentKey,
    warnings,
  };
}
export function importReport(state, report) {
  const next = clone(state);
  const previous = state.imports.find(
    (x) =>
      (report.reportId && x.reportId === report.reportId) ||
      x.contentKey === report.contentKey,
  );
  if (previous) {
    assert(
      previous.contentKey === report.contentKey,
      "相同 reportId 的内容发生变化；请在原记录中编辑，或为新报告使用唯一 reportId",
    );
    return {
      state: next,
      duplicate: true,
      added: { tasks: 0, sessions: 0, errors: 0 },
    };
  }
  const added = { tasks: 0, sessions: 0, errors: 0 };
  for (const type of ["tasks", "sessions"]) {
    for (const row of report[type]) {
      const sameId = next[type].find((x) => x.id === row.id);
      assert(
        !sameId || identity(sameId) === identity(row),
        `${type} 的 id 冲突，请更正 id 或直接编辑原记录`,
      );
      if (!next[type].some((x) => identity(x) === identity(row))) {
        next[type].push(clone(row));
        added[type]++;
      }
    }
  }
  for (const event of report.errors) {
    let group = next.errors.find((x) => errorKey(x) === errorKey(event));
    const occurrenceKey = canonical([
      event.date,
      event.skill,
      event.original,
      event.corrected,
      event.explanation,
    ]);
    const sameId = next.errors
      .flatMap((x) => x.occurrences)
      .find((x) => x.id === event.id);
    assert(!sameId || sameId.key === occurrenceKey, "纠错 id 冲突，请更正 id");
    if (sameId || group?.occurrences.some((x) => x.key === occurrenceKey))
      continue;
    if (!group) {
      group = {
        id: uid(),
        original: event.original,
        corrected: event.corrected,
        category: event.category,
        explanation: event.explanation,
        status: "review",
        occurrences: [],
      };
      next.errors.push(group);
    }
    group.occurrences.push({
      id: event.id,
      date: event.date,
      skill: event.skill,
      key: occurrenceKey,
    });
    group.status = "review"; // A recurrence reopens a mastered error.
    if (event.explanation) group.explanation = event.explanation;
    added.errors++;
  }
  next.imports.push({
    reportId: report.reportId,
    contentKey: report.contentKey,
    importedOn: today(),
  });
  return { state: next, duplicate: false, added };
}
export function backup(state) {
  return {
    app: "ielts-tracker",
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    data: clone(state),
  };
}
export function restore(input) {
  const v = typeof input === "string" ? JSON.parse(input) : clone(input);
  keys(v, ["app", "backupVersion", "exportedAt", "data"], "备份");
  assert(
    v.app === "ielts-tracker" && v.backupVersion === 1,
    "不是兼容的完整备份（backupVersion: 1）",
  );
  const s = v.data;
  keys(
    s,
    [
      "schemaVersion",
      "tasks",
      "sessions",
      "errors",
      "imports",
      "stages",
      "reviews",
    ],
    "data",
  );
  assert(s.schemaVersion === 1, "不支持的数据版本");
  const next = emptyState();
  next.tasks = array(s.tasks, "tasks").map((x) => validateTask(x));
  next.sessions = array(s.sessions, "sessions").map((x) => validateSession(x));
  next.errors = array(s.errors, "errors").map((e) => {
    keys(
      e,
      [
        "id",
        "original",
        "corrected",
        "category",
        "explanation",
        "status",
        "occurrences",
      ],
      "纠错",
    );
    const occurrences = array(e.occurrences, "occurrences").map((o) => {
      keys(o, ["id", "date", "skill", "key"], "occurrence");
      return {
        id: str(o.id, "occurrence.id", true),
        date: date(o.date),
        skill: choice(o.skill, SKILLS, "skill"),
        key: str(o.key, "key", true, 50000),
      };
    });
    assert(occurrences.length > 0, "纠错至少须有一次来源");
    const valid = validateError({
      id: e.id,
      original: e.original,
      corrected: e.corrected,
      category: e.category,
      explanation: e.explanation,
      date: occurrences[0].date,
      skill: occurrences[0].skill,
    });
    return {
      id: valid.id,
      original: valid.original,
      corrected: valid.corrected,
      category: valid.category,
      explanation: valid.explanation,
      status: choice(e.status, ["review", "mastered"], "status"),
      occurrences,
    };
  });
  next.imports = array(s.imports, "imports").map((x) => {
    keys(x, ["reportId", "contentKey", "importedOn"], "imports");
    return {
      reportId: x.reportId == null ? null : str(x.reportId, "reportId", true),
      contentKey: str(x.contentKey, "contentKey", true, 4000000),
      importedOn: date(x.importedOn),
    };
  });
  keys(s.stages, SKILLS, "stages");
  for (const skill of SKILLS) {
    const stage = s.stages[skill];
    keys(stage, ["level", "changedOn", "history"], "stage");
    const level = choice(stage.level, [1, 2, 3, 4], "level");
    const history = array(stage.history, "history").map((h) => {
      keys(h, ["date", "from", "to", "reason"], "history");
      return {
        date: date(h.date),
        from: choice(h.from, [1, 2, 3, 4], "from"),
        to: choice(h.to, [1, 2, 3, 4], "to"),
        reason: str(h.reason, "reason", true),
      };
    });
    next.stages[skill] = {
      level,
      changedOn: stage.changedOn === null ? null : date(stage.changedOn),
      history,
    };
  }
  next.reviews = array(s.reviews, "reviews").map((r) => {
    keys(r, ["id", "date", "summary", "adjustments"], "review");
    return {
      id: str(r.id, "review.id", true),
      date: date(r.date),
      summary: str(r.summary, "summary", true),
      adjustments: str(r.adjustments, "adjustments"),
    };
  });
  for (const type of ["tasks", "sessions", "errors", "reviews"])
    assert(
      new Set(next[type].map((x) => x.id)).size === next[type].length,
      `${type} 包含重复 id`,
    );
  const occurrenceIds = next.errors.flatMap((e) =>
    e.occurrences.map((o) => o.id),
  );
  assert(
    new Set(occurrenceIds).size === occurrenceIds.length,
    "纠错来源包含重复 id",
  );
  return next;
}
export function dayRange(end, days) {
  const anchor = new Date(`${date(end)}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) =>
    new Date(anchor.getTime() - (days - 1 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}
export function comparableKey(s) {
  // Unknown conditions cannot establish comparability; AI scores and repeat attempts are excluded.
  if (
    !["listening", "reading"].includes(s.skill) ||
    !s.source ||
    !s.questionType ||
    !s.difficulty ||
    s.timed === null ||
    s.firstAttempt !== true ||
    s.correct === null ||
    s.scoreType === "ai_estimate"
  )
    return null;
  return canonical([
    s.skill,
    s.source,
    s.questionType,
    s.difficulty,
    s.timed,
    s.firstAttempt,
    s.scoreType,
    s.total,
  ]);
}
export function analytics(state, end = today(), days = 7) {
  const dates = dayRange(end, days),
    within = (x) => dates.includes(x.date);
  const tasks = state.tasks.filter(within),
    sessions = state.sessions.filter(within);
  // Tasks are the authoritative daily check-in. Session minutes are used only on days without tasks,
  // including when task actualMinutes is null, to prevent guessing or counting the same work twice.
  const daily = dates.map((d) => {
    const ts = tasks.filter((t) => t.date === d),
      ss = sessions.filter((s) => s.date === d);
    const source = ts.length
      ? ts.map((t) => ({ skill: t.skill, minutes: t.actualMinutes }))
      : ss;
    const known = source.filter((s) => s.minutes !== null);
    return {
      date: d,
      minutes: known.length ? known.reduce((n, s) => n + s.minutes, 0) : null,
      unknown: source.filter((s) => s.minutes === null).length,
      taskCount: ts.length,
      completedCount: ts.filter((t) => t.completed).length,
      completion: ts.length
        ? ts.filter((t) => t.completed).length / ts.length
        : null,
      bySkill: Object.fromEntries(
        SKILLS.map((k) => [
          k,
          known.filter((x) => x.skill === k).reduce((n, x) => n + x.minutes, 0),
        ]),
      ),
    };
  });
  const groups = new Map();
  for (const s of sessions) {
    const k = comparableKey(s);
    if (k) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
  }
  const trends = [...groups.values()].map((rows) => ({
    rows: rows.sort((a, b) => a.date.localeCompare(b.date)),
    label: `${LABELS[rows[0].skill]} · ${rows[0].source} · ${rows[0].questionType} · ${rows[0].difficulty} · ${rows[0].timed ? "计时" : "不限时"} · ${SCORE_LABELS[rows[0].scoreType]} · ${rows[0].total}题`,
  }));
  return {
    daily,
    totalMinutes: daily.reduce((n, x) => n + (x.minutes ?? 0), 0),
    unknown: daily.reduce((n, x) => n + x.unknown, 0),
    completion: tasks.length
      ? tasks.filter((t) => t.completed).length / tasks.length
      : null,
    bySkill: Object.fromEntries(
      SKILLS.map((k) => [k, daily.reduce((n, x) => n + x.bySkill[k], 0)]),
    ),
    trends,
    excluded: sessions.filter((s) => comparableKey(s) === null).length,
  };
}
export function stageEvidence(state, skill, end = today()) {
  const dates = dayRange(end, 14);
  const grouped = new Map();
  for (const s of state.sessions.filter(
    (x) => x.skill === skill && dates.includes(x.date),
  )) {
    let key = comparableKey(s),
      score = s.total ? s.correct / s.total : null;
    if (
      ["speaking", "writing"].includes(skill) &&
      s.source &&
      (s.questionType || s.writingTask) &&
      s.difficulty &&
      s.timed !== null &&
      s.firstAttempt === true &&
      s.band !== null &&
      s.scoreType !== "practice"
    ) {
      key = canonical([
        s.skill,
        s.source,
        s.questionType,
        s.writingTask,
        s.difficulty,
        s.timed,
        s.firstAttempt,
        s.scoreType,
      ]);
      score = s.band / 9;
    }
    if (key && score !== null) {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ ...s, score });
    }
  }
  const candidates = [...grouped.values()].filter(
    (rows) => rows.length >= 3 && new Set(rows.map((s) => s.date)).size >= 3,
  );
  const evidence = candidates.sort((a, b) => b.length - a.length)[0] ?? [];
  const stage = state.stages[skill],
    last =
      stage.changedOn ??
      state.sessions
        .filter((s) => s.skill === skill && s.date <= end)
        .map((s) => s.date)
        .sort()[0];
  const elapsed = last
    ? Math.floor((Date.parse(end) - Date.parse(last)) / 86400000) + 1
    : 0;
  const ordered = evidence.sort((a, b) => a.date.localeCompare(b.date));
  const improved =
    ordered.length >= 3 &&
    ordered.at(-1).score > ordered[0].score &&
    ordered.slice(-3).every((x) => x.score >= ordered[0].score);
  const ready = elapsed >= 14 && improved && stage.level < 4;
  return {
    ready,
    count: evidence.length,
    elapsed,
    reason: ready
      ? "14 天窗口内至少 3 个不同日期的可比记录，最近表现高于起点；可结合错误复习情况手动升级。"
      : "需经过 14 天、至少 3 个不同日期的可比记录及持续进步；目前建议维持训练并补充证据。",
  };
}
export function csv(state) {
  const rows = [
    [
      "recordType",
      "date",
      "skill",
      "title/source",
      "plannedMinutes",
      "actualMinutes",
      "completed",
      "scoreType",
      "correct",
      "total",
      "band",
      "notes",
    ],
  ];
  for (const t of state.tasks)
    rows.push([
      "task",
      t.date,
      t.skill,
      t.title,
      t.plannedMinutes,
      t.actualMinutes,
      t.completed,
      "",
      "",
      "",
      "",
      t.notes,
    ]);
  for (const s of state.sessions)
    rows.push([
      "session",
      s.date,
      s.skill,
      s.source,
      "",
      s.minutes,
      "",
      s.scoreType,
      s.correct,
      s.total,
      s.band,
      s.feedback,
    ]);
  // Prevent spreadsheet formula injection. JSON backup preserves literal text.
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              `"${String(v ?? "")
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export const STORAGE_KEY = "ielts-tracker:v1";
export function loadState(storage) {
  const saved = storage.getItem(STORAGE_KEY);
  return saved === null ? emptyState() : restore(JSON.parse(saved));
}
export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(backup(state)));
}
