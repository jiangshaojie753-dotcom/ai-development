// Domain logic: local-only knowledge cards, provenance and evidence-based review.
export const TYPES = { word: "生词", phrase: "词组", sentence: "难句" };
export const REASONS = {
  unknown_word: "生词不认识",
  unknown_phrase: "词组不认识",
  listening: "听不懂 / 听不出来",
  reading: "看不懂",
  grammar: "语法结构不理解",
  other: "其他",
};
export const GRADES = {
  unknown: "不认识",
  vague: "模糊",
  known: "认识",
  fluent: "熟练",
};
export const MODES = {
  en: "看英文回忆中文",
  zh: "看中文回忆英文",
  phrase: "看难句解释关键短语",
};
const skills = ["listening", "reading", "speaking", "writing"];
const copy = (x) => JSON.parse(JSON.stringify(x));
const check = (x, m) => {
  if (!x) throw new Error(m);
};
const text = (x, name, required = false) => {
  check(
    typeof x === "string" && x.length <= 10000 && (!required || x.trim()),
    `${name} 应为${required ? "非空" : ""}文本（最多 10000 字）`,
  );
  return x.trim();
};
const list = (x, name) => {
  check(
    Array.isArray(x) && x.length <= 50000,
    `${name} 必须为数组，最多 50000 项`,
  );
  return x;
};
const one = (x, values, name) => {
  check(values.includes(x), `${name} 不在支持的选项中`);
  return x;
};
function fields(x, allowed) {
  check(x && typeof x === "object" && !Array.isArray(x), "记录必须是对象");
  for (const k of Object.keys(x)) check(allowed.includes(k), `未知字段：${k}`);
}
export function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDay(x) {
  check(
    typeof x === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      Number.isFinite(Date.parse(x)) &&
      new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x,
    "日期须为真实 YYYY-MM-DD",
  );
  return x;
}
export function plusDays(day, n) {
  return new Date(Date.parse(validDay(day)) + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export const emptyVocabulary = () => ({ cards: [], reviews: [] });
const ENTRY_FIELDS = [
  "category",
  "english",
  "meaning",
  "pos",
  "keyPoints",
  "reason",
  "sourceSkill",
  "material",
  "question",
  "example",
  "explanation",
  "addedDate",
  "parentId",
];
export function entry(input) {
  fields(input, ENTRY_FIELDS);
  const result = {
    category: one(input.category, Object.keys(TYPES), "分类"),
    english: text(input.english, "英文原文", true),
    meaning: text(input.meaning, "中文释义", true),
  };
  for (const k of [
    "pos",
    "keyPoints",
    "material",
    "question",
    "example",
    "explanation",
  ])
    result[k] = text(input[k] ?? "", k);
  result.reason = one(input.reason ?? "other", Object.keys(REASONS), "原因");
  result.sourceSkill = one(input.sourceSkill, skills, "来源科目");
  result.addedDate = validDay(input.addedDate ?? localDay());
  result.parentId =
    input.parentId == null ? null : text(input.parentId, "原句 id", true);
  check(result.category === "word" || !result.pos, "词性只适用于生词");
  return result;
}
const norm = (x) =>
  x.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function senseKey(x) {
  return JSON.stringify(
    x.category === "sentence"
      ? [x.category, norm(x.english)]
      : [x.category, norm(x.english), norm(x.meaning), norm(x.pos)],
  );
}
const occurrence = (e) =>
  Object.fromEntries(
    [
      "meaning",
      "keyPoints",
      "reason",
      "sourceSkill",
      "material",
      "question",
      "example",
      "explanation",
      "addedDate",
      "parentId",
    ].map((k) => [k, e[k]]),
  );
function key(x) {
  return JSON.stringify(
    Object.keys(x)
      .sort()
      .map((k) => [k, x[k]]),
  );
}
export function addEntries(vocabulary, inputs) {
  const next = copy(vocabulary),
    counts = { added: 0, contexts: 0, duplicates: 0 };
  for (const raw of inputs) {
    const e = entry(raw);
    if (e.parentId)
      check(
        next.cards.some(
          (c) =>
            c.id === e.parentId && c.category === "sentence" && !c.archived,
        ),
        "关联原句不存在或已删除",
      );
    let card = next.cards.find((c) => senseKey(c) === senseKey(e));
    const context = occurrence(e);
    if (!card) {
      card = {
        ...e,
        id: crypto.randomUUID(),
        archived: false,
        revision: 1,
        occurrences: [context],
      };
      delete card.parentId;
      next.cards.push(card);
      counts.added++;
    } else {
      card.archived = false;
      if (card.occurrences.some((o) => key(o) === key(context)))
        counts.duplicates++;
      else {
        card.occurrences.push(context);
        counts.contexts++;
      }
    }
  }
  return { vocabulary: next, counts };
}
export function editCard(vocabulary, id, raw) {
  const next = copy(vocabulary),
    card = next.cards.find((c) => c.id === id);
  check(card, "卡片不存在");
  const e = entry(raw);
  check(
    !next.cards.some((c) => c.id !== id && senseKey(c) === senseKey(e)),
    "相同词义卡片已存在；请向已有卡片导入新来源",
  );
  if (e.category !== "sentence")
    check(
      !next.cards.some((c) => c.occurrences.some((o) => o.parentId === id)),
      "此原句有关联词汇，不能改为非难句分类",
    );
  if (e.parentId)
    check(
      e.parentId !== id &&
        next.cards.some(
          (c) => c.id === e.parentId && c.category === "sentence",
        ),
      "关联原句无效",
    );
  check(
    !next.reviews.some((r) => r.cardId === id && r.date < e.addedDate),
    "添加日期不能晚于已有复习记录",
  );
  if (senseKey(card) !== senseKey(e)) card.revision++;
  Object.assign(card, e);
  delete card.parentId;
  // Editing a correction is not a new encounter; retain immutable source snapshots.
  return next;
}
export function schedule(vocabulary, card, day = localDay()) {
  const events = vocabulary.reviews
    .filter(
      (r) =>
        r.cardId === card.id && r.revision === card.revision && r.date <= day,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = events.at(-1);
  let interval = 0,
    streak = 0,
    previousDate = null;
  for (const r of events) {
    if (r.grade === "unknown") {
      interval = 1;
      streak = 0;
    }
    if (r.grade === "vague") {
      interval = 2;
      streak = 0;
    }
    if (r.grade === "known") {
      interval = Math.min(180, Math.max(4, Math.round(interval * 2)));
      streak = 0;
    }
    if (r.grade === "fluent") {
      interval = Math.min(180, Math.max(7, Math.round(interval * 2.5)));
      streak = r.date !== previousDate ? streak + 1 : streak;
    }
    previousDate = r.date;
  }
  return {
    nextDate: last ? plusDays(last.date, interval) : card.addedDate,
    interval,
    status: !last ? "new" : streak >= 2 ? "mastered" : "learning",
    last,
  };
}
export function reviewCard(vocabulary, id, grade, mode, day = localDay()) {
  validDay(day);
  one(grade, Object.keys(GRADES), "反馈");
  one(mode, Object.keys(MODES), "复习模式");
  const card = vocabulary.cards.find((c) => c.id === id && !c.archived);
  check(card, "卡片不存在或已删除");
  check(
    day >= card.addedDate && day <= localDay(),
    "复习日期不能早于添加日期或晚于今天",
  );
  check(
    mode !== "phrase" ||
      (card.category === "sentence" && card.keyPoints.trim()),
    "短语解释模式需要包含关键短语的难句",
  );
  check(
    mode !== "zh" || card.category !== "sentence",
    "中文回忆模式用于生词和词组",
  );
  check(
    !vocabulary.reviews.some((r) => r.cardId === id && r.date === day),
    "这张卡今天已完成复习，请勿重复提交",
  );
  const next = copy(vocabulary);
  next.reviews.push({
    id: crypto.randomUUID(),
    cardId: id,
    revision: card.revision,
    date: day,
    grade,
    mode,
  });
  return next;
}
export function vocabularyStats(vocabulary, day = localDay(), days = 7) {
  const cards = vocabulary.cards.filter(
      (c) => !c.archived && c.addedDate <= day,
    ),
    reviewed = vocabulary.reviews.filter((r) => r.date === day);
  const mastered = cards.filter(
    (c) => schedule(vocabulary, c, day).status === "mastered",
  );
  return {
    total: cards.length,
    mastered: mastered.length,
    completed: new Set(reviewed.map((r) => r.cardId)).size,
    due: cards.filter(
      (c) =>
        schedule(vocabulary, c, day).nextDate <= day &&
        !reviewed.some((r) => r.cardId === c.id),
    ).length,
    rates: Object.fromEntries(
      Object.keys(TYPES).map((k) => {
        const total = cards.filter((c) => c.category === k).length;
        return [
          k,
          total
            ? mastered.filter((c) => c.category === k).length / total
            : null,
        ];
      }),
    ),
    daily: Array.from({ length: days }, (_, i) => {
      const date = plusDays(day, i - days + 1);
      return {
        date,
        count: new Set(
          vocabulary.reviews
            .filter((r) => r.date === date)
            .map((r) => r.cardId),
        ).size,
      };
    }),
  };
}
export function parseVocabulary(raw) {
  check(raw.length <= 2 * 1024 * 1024, "导入最大 2 MB");
  const source = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1");
  let rows;
  if (source.startsWith("{") || source.startsWith("[")) {
    const obj = JSON.parse(source);
    if (Array.isArray(obj)) rows = obj;
    else {
      fields(obj, ["vocabularyVersion", "entries"]);
      check(obj.vocabularyVersion === 1, "不支持的词汇报告版本");
      rows = obj.entries;
    }
  } else {
    // TSV is intentionally explicit: free prose cannot be safely guessed into meanings.
    const lines = source.split(/\r?\n/).filter((x) => x.trim());
    rows = lines.map((line, i) => {
      const parts = line.split("\t");
      check(
        parts.length >= 3 && parts.length <= 4,
        `第 ${i + 1} 行需：分类、英文、中文、可选科目（Tab 分隔）`,
      );
      return {
        category:
          { 生词: "word", 词组: "phrase", 难句: "sentence" }[parts[0]] ??
          parts[0],
        english: parts[1],
        meaning: parts[2],
        sourceSkill: parts[3] || "reading",
      };
    });
  }
  list(rows, "entries");
  check(rows.length > 0 && rows.length <= 500, "每次导入 1–500 条");
  // Preserve editable invalid rows; validation is per row before confirmation.
  return rows.map((x) => {
    fields(x, ENTRY_FIELDS);
    return { ...x };
  });
}
export function exportVocabulary(v) {
  return { app: "ielts-vocabulary", version: 1, data: copy(v) };
}
export function restoreVocabularyFile(raw) {
  const obj = JSON.parse(raw);
  fields(obj, ["app", "version", "data"]);
  check(obj.app === "ielts-vocabulary" && obj.version === 1, "不是词汇备份");
  return validateVocabulary(obj.data);
}
export function vocabularyCSV(v) {
  const headers = [
    "category",
    "english",
    "meaning",
    "pos",
    "keyPoints",
    "reason",
    "sourceSkill",
    "material",
    "question",
    "example",
    "explanation",
    "addedDate",
    "status",
    "nextDate",
    "occurrences",
    "parentIds",
  ];
  const rows = v.cards
    .filter((c) => !c.archived)
    .map((c) => {
      const s = schedule(v, c);
      return [
        ...headers.slice(0, 12).map((k) => c[k]),
        s.status,
        s.nextDate,
        JSON.stringify(c.occurrences),
        JSON.stringify([
          ...new Set(c.occurrences.map((o) => o.parentId).filter(Boolean)),
        ]),
      ];
    });
  return (
    "\uFEFF" +
    [headers, ...rows]
      .map((row) =>
        row
          .map(
            (x) =>
              '"' +
              String(x ?? "")
                .replace(/^(\s*[=+@-])/, "'$1")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function validateVocabulary(v) {
  fields(v, ["cards", "reviews"]);
  const ids = new Set();
  const cards = list(v.cards, "cards").map((c) => {
    fields(c, [
      ...ENTRY_FIELDS.filter((x) => x !== "parentId"),
      "id",
      "archived",
      "revision",
      "occurrences",
    ]);
    const base = entry(
      Object.fromEntries(
        ENTRY_FIELDS.filter((k) => k !== "parentId").map((k) => [k, c[k]]),
      ),
    );
    const id = text(c.id, "卡片 id", true);
    check(!ids.has(id), "卡片 id 重复");
    ids.add(id);
    check(typeof c.archived === "boolean", "archived 必须为布尔值");
    const occurrences = list(c.occurrences, "occurrences").map((o) => {
      fields(o, Object.keys(occurrence(base)));
      const e = entry({ ...base, ...o });
      return occurrence(e);
    });
    check(occurrences.length > 0, "卡片缺少来源");
    check(Number.isInteger(c.revision) && c.revision >= 1, "无效卡片修订版本");
    delete base.parentId;
    return {
      ...base,
      id,
      archived: c.archived,
      revision: c.revision,
      occurrences,
    };
  });
  for (const c of cards)
    for (const o of c.occurrences)
      if (o.parentId)
        check(
          o.parentId !== c.id &&
            cards.some((p) => p.id === o.parentId && p.category === "sentence"),
          "关联原句不存在",
        );
  const reviewIds = new Set(),
    dates = new Set();
  const reviews = list(v.reviews, "reviews").map((r) => {
    fields(r, ["id", "cardId", "revision", "date", "grade", "mode"]);
    text(r.id, "复习 id", true);
    check(!reviewIds.has(r.id), "复习 id 重复");
    reviewIds.add(r.id);
    const card = cards.find((c) => c.id === r.cardId);
    check(card, "复习卡片不存在");
    check(
      Number.isInteger(r.revision) &&
        r.revision >= 1 &&
        r.revision <= card.revision,
      "无效复习修订版本",
    );
    validDay(r.date);
    check(r.date <= localDay(), "复习日期不能在未来");
    check(r.date >= card.addedDate, "复习不能早于卡片日期");
    const pair = JSON.stringify([r.cardId, r.date]);
    check(!dates.has(pair), "同日重复复习");
    dates.add(pair);
    one(r.grade, Object.keys(GRADES), "反馈");
    one(r.mode, Object.keys(MODES), "复习模式");
    return { ...r };
  });
  return { cards, reviews };
}
