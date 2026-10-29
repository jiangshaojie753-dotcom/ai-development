import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyVocabulary,
  entry,
  addEntries,
  editCard,
  schedule,
  reviewCard,
  vocabularyStats,
  parseVocabulary,
  validateVocabulary,
  exportVocabulary,
  restoreVocabularyFile,
  vocabularyCSV,
} from "../vocabulary.js";
import {
  emptyState,
  backup,
  restore,
  loadState,
  saveState,
  STORAGE_KEY,
} from "../core.js";
import { createOCRAdapter } from "../ocr.js";
const row = (extra = {}) => ({
  category: "word",
  english: "bank",
  meaning: "银行",
  pos: "noun",
  sourceSkill: "reading",
  addedDate: "2000-01-01",
  ...extra,
});
const make = (rows = [row()]) => addEntries(emptyVocabulary(), rows).vocabulary;
test("V1 migration preserves all old data and exact original payload on first V2 save", () => {
  const old = emptyState();
  delete old.vocabulary;
  old.schemaVersion = 1;
  old.tasks = [
    {
      id: "synthetic",
      date: "2000-01-01",
      skill: "reading",
      title: "Synthetic",
      plannedMinutes: null,
      actualMinutes: null,
      completed: false,
      notes: "",
    },
  ];
  const payload = JSON.stringify({
    app: "ielts-tracker",
    backupVersion: 1,
    exportedAt: "2000-01-01",
    data: old,
  });
  const map = new Map([[STORAGE_KEY, payload]]),
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    };
  const state = loadState(storage);
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.vocabulary, emptyVocabulary());
  for (const k of [
    "tasks",
    "sessions",
    "errors",
    "imports",
    "stages",
    "reviews",
  ])
    assert.deepEqual(state[k], old[k]);
  assert.equal(map.get(STORAGE_KEY), payload);
  state.vocabulary = make();
  saveState(storage, state);
  assert.equal(map.get("ielts-tracker:pre-v2"), payload);
  assert.deepEqual(loadState(storage), state);
  assert.deepEqual(restore(backup(state)), state);
});
test("failed snapshot or main write never discards the old data", () => {
  const old = emptyState();
  old.schemaVersion = 1;
  delete old.vocabulary;
  const payload = JSON.stringify({ ...backup(old), backupVersion: 1 });
  let current = payload;
  const storage = {
    getItem: (k) => (k === STORAGE_KEY ? current : null),
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.throws(() => saveState(storage, loadState(storage)), /quota/);
  assert.equal(current, payload);
});
test("different senses / parts of speech stay distinct; same sense merges contexts without duplicating reimport", () => {
  const rows = [
    row(),
    row({
      english: " BANK ",
      material: "Other synthetic source",
      example: "Synthetic context",
    }),
    row({ meaning: "河岸" }),
    row({ meaning: "银行", pos: "verb" }),
  ];
  const v = make(rows);
  assert.equal(v.cards.length, 3);
  assert.equal(v.cards[0].occurrences.length, 2);
  const again = addEntries(v, rows);
  assert.deepEqual(again.vocabulary, v);
  assert.equal(again.counts.duplicates, 4);
});
test("sentence translations and extracted vocabulary retain provenance after deleting parent", () => {
  let v = make([
    row({
      category: "sentence",
      english: "A synthetic sentence.",
      meaning: "虚构句子",
      pos: "",
      keyPoints: "synthetic = 虚构的",
    }),
  ]);
  const id = v.cards[0].id;
  v = addEntries(v, [
    row({ parentId: id, example: "A synthetic sentence." }),
    row({
      category: "sentence",
      english: "A synthetic sentence.",
      meaning: "不同翻译",
      pos: "",
      material: "Second source",
    }),
  ]).vocabulary;
  assert.equal(v.cards.length, 2);
  assert.equal(v.cards[0].occurrences.length, 2);
  assert.equal(v.cards[1].occurrences[0].parentId, id);
  v.cards[0].archived = true;
  assert.deepEqual(validateVocabulary(v), v);
  assert.throws(() => addEntries(v, [row({ parentId: "missing" })]), /原句/);
});
test("preview permits corrections, rejects unsupported fields, and performs no writes", () => {
  const v = emptyVocabulary();
  const rows = parseVocabulary(
    '{"vocabularyVersion":1,"entries":[{"category":"word","english":"","meaning":"","sourceSkill":"reading"}]}',
  );
  assert.equal(rows.length, 1);
  assert.throws(() => entry(rows[0]));
  assert.equal(v.cards.length, 0);
  assert.equal(parseVocabulary("生词\tsample\t样本")[0].sourceSkill, "reading");
  assert.throws(() => parseVocabulary("ambiguous free prose"));
  assert.throws(
    () => parseVocabulary('[{"english":"sample","apiKey":"bad"}]'),
    /未知字段/,
  );
});
test("four feedback levels schedule correctly, including month and leap-day boundaries", () => {
  for (const [grade, expected] of [
    ["unknown", "2000-02-29"],
    ["vague", "2000-03-01"],
    ["known", "2000-03-03"],
    ["fluent", "2000-03-06"],
  ]) {
    let v = make([row({ addedDate: "2000-02-28" })]);
    v = reviewCard(v, v.cards[0].id, grade, "en", "2000-02-28");
    assert.equal(schedule(v, v.cards[0], "2000-02-28").nextDate, expected);
  }
});
test("mastery requires two genuine fluent dates; failure resets it, duplicate submissions do not count", () => {
  let v = make(),
    id = v.cards[0].id;
  assert.equal(schedule(v, v.cards[0]).status, "new");
  v = reviewCard(v, id, "fluent", "en", "2000-01-01");
  assert.equal(schedule(v, v.cards[0]).status, "learning");
  assert.throws(
    () => reviewCard(v, id, "fluent", "en", "2000-01-01"),
    /已完成/,
  );
  v = reviewCard(v, id, "fluent", "zh", "2000-01-08");
  assert.equal(schedule(v, v.cards[0]).status, "mastered");
  v = reviewCard(v, id, "unknown", "en", "2000-01-26");
  assert.equal(schedule(v, v.cards[0]).status, "learning");
  assert.equal(vocabularyStats(v, "2000-01-26").completed, 1);
});
test("changing a learned meaning resets evidence while keeping history, unrelated edits do not", () => {
  let v = make(),
    id = v.cards[0].id;
  v = reviewCard(v, id, "fluent", "en", "2000-01-01");
  v = reviewCard(v, id, "fluent", "en", "2000-01-08");
  v = editCard(v, id, row({ explanation: "New note" }));
  assert.equal(schedule(v, v.cards[0]).status, "mastered");
  v = editCard(v, id, row({ meaning: "河岸" }));
  assert.equal(schedule(v, v.cards[0]).status, "new");
  assert.equal(v.reviews.length, 2);
  assert.deepEqual(validateVocabulary(v), v);
});
test("three review modes enforce applicable content; stats never invent mastery", () => {
  let v = make([
    row(),
    row({
      category: "sentence",
      english: "Synthetic sentence.",
      meaning: "虚构句子",
      pos: "",
      keyPoints: "Synthetic = 虚构的",
    }),
  ]);
  assert.throws(() =>
    reviewCard(v, v.cards[0].id, "known", "phrase", "2000-01-01"),
  );
  assert.throws(() =>
    reviewCard(v, v.cards[1].id, "known", "zh", "2000-01-01"),
  );
  v = reviewCard(v, v.cards[1].id, "known", "phrase", "2000-01-01");
  const s = vocabularyStats(v, "2000-01-01", 30);
  assert.equal(s.mastered, 0);
  assert.equal(s.due, 1);
  assert.equal(s.rates.word, 0);
  assert.equal(s.rates.phrase, null);
  assert.equal(s.daily.at(-1).count, 1);
});
test("vocabulary-only JSON and full backup preserve links, contexts, reviews and archived cards", () => {
  let v = make();
  v = reviewCard(v, v.cards[0].id, "known", "en", "2000-01-01");
  v.cards[0].archived = true;
  assert.deepEqual(
    restoreVocabularyFile(JSON.stringify(exportVocabulary(v))),
    v,
  );
  const state = emptyState();
  state.vocabulary = v;
  assert.deepEqual(restore(backup(state)), state);
  const bad = exportVocabulary(v);
  bad.data.reviews[0].cardId = "missing";
  assert.throws(() => restoreVocabularyFile(JSON.stringify(bad)));
});
test("CSV protects spreadsheet formulas and preserves context text", () => {
  const v = make([row({ english: "=SYNTHETIC()", example: 'Line\n"quoted"' })]);
  const csv = vocabularyCSV(v);
  assert.ok(csv.includes("'=SYNTHETIC()"));
  assert.ok(csv.includes("occurrences"));
});
test("unconfigured OCR never reports success or calls a provider", async () => {
  const ocr = createOCRAdapter();
  assert.equal(ocr.configured, false);
  await assert.rejects(
    () => ocr.recognize({ type: "image/png", size: 1 }),
    /未配置/,
  );
});
