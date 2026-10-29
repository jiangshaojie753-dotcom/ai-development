import test from "node:test";
import assert from "node:assert/strict";
import {
  dictionaryQuery,
  collinsURL,
  localDefinitions,
  createFreeDictionary,
  parseDefinitions,
  parseTranslation,
} from "../dictionary.js";
import {
  emptyVocabulary,
  addEntries,
  editCard,
  reviewCard,
  schedule,
  exportVocabulary,
  restoreVocabularyFile,
  vocabularyCSV,
} from "../vocabulary.js";
import {
  emptyState,
  backup,
  restore,
  saveState,
  loadState,
  STORAGE_KEY,
} from "../core.js";
const row = (extra) => ({
  category: "word",
  english: "sample",
  meaning: "样本",
  sourceSkill: "reading",
  pos: "noun",
  addedDate: "2000-01-01",
  ...extra,
});
const make = (rows) => addEntries(emptyVocabulary(), rows).vocabulary;
const editable = (c) =>
  Object.fromEntries(
    Object.entries(c).filter(
      ([k]) => !["id", "revision", "archived", "occurrences"].includes(k),
    ),
  );

test("legacy V2 cards gain empty definition fields without losing history or inventing past definitions", () => {
  let v = make([row()]);
  v = reviewCard(v, v.cards[0].id, "fluent", "en", "2000-01-01");
  v = reviewCard(v, v.cards[0].id, "fluent", "en", "2000-01-08");
  for (const c of v.cards)
    for (const x of [c, ...c.occurrences]) {
      delete x.englishDefinition;
      delete x.definitionSource;
      delete x.meaningSource;
    }
  const state = emptyState();
  state.vocabulary = v;
  const original = JSON.stringify(backup(state));
  const map = new Map([[STORAGE_KEY, original]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
  const migrated = loadState(storage);
  assert.equal(map.get(STORAGE_KEY), original);
  assert.deepEqual(migrated.vocabulary.reviews, v.reviews);
  assert.equal(migrated.vocabulary.cards[0].englishDefinition, "");
  assert.equal(
    schedule(migrated.vocabulary, migrated.vocabulary.cards[0]).status,
    "mastered",
  );
  saveState(storage, migrated);
  assert.equal(map.get("ielts-tracker:pre-dictionary"), original);
  assert.deepEqual(loadState(storage), migrated);
  const enriched = editCard(
    migrated.vocabulary,
    v.cards[0].id,
    row({ englishDefinition: "Synthetic definition" }),
  );
  assert.equal(enriched.cards[0].occurrences[0].englishDefinition, "");
  assert.equal(
    restoreVocabularyFile(JSON.stringify(exportVocabulary(enriched))).cards[0]
      .occurrences[0].englishDefinition,
    "",
  );
});

test("failing pre-dictionary snapshot leaves the original V2 payload untouched", () => {
  const state = emptyState();
  state.vocabulary = make([row()]);
  delete state.vocabulary.cards[0].englishDefinition;
  const original = JSON.stringify(backup(state));
  let current = original;
  const storage = {
    getItem: (k) => (k === STORAGE_KEY ? current : null),
    setItem: (k, v) => {
      if (k === "ielts-tracker:pre-dictionary") throw new Error("quota");
      current = v;
    },
  };
  assert.throws(() => saveState(storage, loadState(storage)), /quota/);
  assert.equal(current, original);
});

test("definitions and attribution survive full backup, vocabulary backup, CSV, and reload", () => {
  const state = emptyState();
  state.vocabulary = make([
    row({
      englishDefinition: 'Synthetic "definition",\nsecond line.',
      definitionSource: "Synthetic test source",
      meaningSource: "个人笔记",
    }),
  ]);
  assert.deepEqual(restore(backup(state)), state);
  assert.deepEqual(
    restoreVocabularyFile(JSON.stringify(exportVocabulary(state.vocabulary))),
    state.vocabulary,
  );
  const csv = vocabularyCSV(state.vocabulary);
  assert.match(csv, /englishDefinition/);
  assert.match(csv, /Synthetic ""definition"",\nsecond line\./);
  assert.match(csv, /Synthetic test source/);
});

test("distinct English senses remain separate and repeating a selected sense is idempotent", () => {
  const a = row({ englishDefinition: "Synthetic sense one" });
  const b = row({ englishDefinition: "Synthetic sense two" });
  const v = make([a, b]);
  assert.equal(v.cards.length, 2);
  assert.deepEqual(addEntries(v, [a, b]).vocabulary, v);
  const old = make([row()]);
  const enriched = addEntries(old, [a]).vocabulary;
  assert.equal(enriched.cards.length, 1);
  assert.equal(enriched.cards[0].englishDefinition, a.englishDefinition);
  assert.equal(enriched.cards[0].occurrences[0].englishDefinition, "");
  const sentences = make([
    row({category:"sentence",pos:"",english:"A synthetic sentence.",englishDefinition:"Synthetic explanation one"}),
    row({category:"sentence",pos:"",english:"A synthetic sentence.",englishDefinition:"Synthetic explanation two"}),
  ]);
  assert.equal(sentences.cards.length, 1);
  assert.equal(sentences.cards[0].occurrences.length, 2);
});

test("changing English definition resets learning evidence while attribution edits do not", () => {
  let v = make([row({ englishDefinition: "Synthetic definition" })]);
  const id = v.cards[0].id;
  v = reviewCard(v, id, "fluent", "en", "2000-01-01");
  v = reviewCard(v, id, "fluent", "en", "2000-01-08");
  v = editCard(v, id, {
    ...editable(v.cards[0]),
    definitionSource: "Updated attribution",
  });
  assert.equal(schedule(v, v.cards[0]).status, "mastered");
  v = editCard(v, id, {
    ...editable(v.cards[0]),
    englishDefinition: "Different synthetic definition",
  });
  assert.equal(schedule(v, v.cards[0]).status, "new");
  assert.equal(v.reviews.length, 2);
});

test("lookup accepts only short English queries, uses safe Collins links, and retains distinct local senses", () => {
  assert.equal(dictionaryQuery("  take   off "), "take off");
  assert.equal(
    collinsURL("take off"),
    "https://www.collinsdictionary.com/dictionary/english/take-off",
  );
  for (const value of [
    "",
    "<img src=x>",
    "https://example.org",
    "中文",
    "A complete sentence.",
    "a".repeat(81),
  ])
    assert.throws(() => dictionaryQuery(value));
  const v = make([
    row(),
    row({ meaning: "取样", pos: "verb" }),
    row({ english: "samples" }),
  ]);
  assert.equal(localDefinitions(v, " SAMPLE ").length, 2);
  v.cards[0].archived = true;
  assert.equal(localDefinitions(v, "sample").length, 1);
});

const syntheticDictionary = [
  {
    word: "sample",
    license: { name: "Test license", url: "https://example.org/license" },
    sourceUrls: ["https://example.org/sample"],
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          { definition: "Synthetic first sense", example: "Synthetic example" },
          { definition: "Synthetic second sense" },
        ],
      },
    ],
  },
];
test("free lookup preserves separate senses and actual attribution without claiming Collins", async () => {
  const calls = [];
  const adapter = createFreeDictionary(async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(
        url.startsWith("https://api.dictionaryapi.dev")
          ? syntheticDictionary
          : {
              responseStatus: 200,
              responseData: { translatedText: "虚构中文释义 &amp; 解释" },
            },
      ),
    );
  });
  assert.equal(calls.length, 0);
  const candidates = await adapter.definitions("sample");
  assert.equal(candidates.length, 2);
  assert.match(candidates[0].definitionSource, /Test license/);
  assert.doesNotMatch(candidates[0].definitionSource, /Collins/);
  assert.equal(
    await adapter.translate(candidates[0].englishDefinition),
    "虚构中文释义 & 解释",
  );
  assert.equal(
    new URL(calls[1].url).searchParams.get("q"),
    "Synthetic first sense",
  );
  assert.equal(new URL(calls[1].url).searchParams.get("langpair"), "en|zh-CN");
  for (const c of calls) {
    assert.equal(c.options.credentials, "omit");
    assert.equal(c.options.referrerPolicy, "no-referrer");
    assert.equal(c.options.cache, "no-store");
    assert.equal(c.options.redirect, "error");
  }
  await assert.rejects(adapter.definitions("Private sentence."));
  assert.equal(calls.length, 2);
});
test("missing word, provider failure, quota exhaustion, mismatched headword and malformed translations do not invent data", async () => {
  assert.deepEqual(
    await createFreeDictionary(
      async () => new Response("", { status: 404 }),
    ).definitions("sample"),
    [],
  );
  await assert.rejects(
    createFreeDictionary(
      async () => new Response("", { status: 429 }),
    ).definitions("sample"),
    /无法连接/,
  );
  await assert.rejects(
    createFreeDictionary(async () => new Response("not json")).definitions(
      "sample",
    ),
    /无法连接/,
  );
  assert.deepEqual(parseDefinitions(syntheticDictionary, "different"), []);
  for (const data of [
    { responseStatus: 429 },
    { responseStatus: 200, quotaFinished: true },
    { responseStatus: 200, responseData: { translatedText: "RATE LIMITED" } },
  ])
    assert.throws(() => parseTranslation(data));
  assert.equal(
    parseTranslation({
      responseStatus: 200,
      responseData: { translatedText: "测试 &#x4E2D;&#25991;" },
    }),
    "测试 中文",
  );
  const adapter = createFreeDictionary(() => {
    throw new Error("should not fetch");
  });
  await assert.rejects(adapter.translate("a".repeat(501)), /长度限制/);
});
