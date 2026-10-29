// Queries contain only a word/phrase or a public dictionary definition, never a learning record.
export function dictionaryQuery(value) {
  const q = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (
    !q ||
    q.length > 80 ||
    !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*(?: [a-zA-Z]+(?:['’-][a-zA-Z]+)*){0,5}$/.test(
      q,
    )
  )
    throw new Error(
      "请输入一个英文单词或短词组（最多 80 字符），整句请手动填写释义。",
    );
  return q;
}
export function collinsURL(value) {
  return (
    "https://www.collinsdictionary.com/dictionary/english/" +
    encodeURIComponent(
      dictionaryQuery(value).toLowerCase().replaceAll(" ", "-"),
    )
  );
}
export function localDefinitions(vocabulary, value) {
  const query = dictionaryQuery(value).toLowerCase();
  return vocabulary.cards
    .filter(
      (c) =>
        !c.archived &&
        c.category !== "sentence" &&
        c.english
          .normalize("NFKC")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase() === query,
    )
    .map((c) => ({
      english: c.english,
      meaning: c.meaning,
      englishDefinition: c.englishDefinition ?? "",
      pos: c.pos,
      example: c.example,
      definitionSource: c.definitionSource ?? "",
      meaningSource: c.meaningSource ?? "",
      origin: "本机知识卡片",
    }));
}

const cleanText = (x, max = 3000) =>
  typeof x === "string" ? x.trim().slice(0, max) : "";
function sourceURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function parseDefinitions(data, query) {
  if (!Array.isArray(data)) throw new Error("词典返回格式异常，请稍后重试。");
  const candidates = [],
    seen = new Set();
  for (const item of data.slice(0, 10)) {
    if (cleanText(item?.word).toLowerCase() !== query.toLowerCase()) continue;
    const attribution = [
      "Free Dictionary API",
      cleanText(item.license?.name, 150),
      sourceURL(item.sourceUrls?.[0]),
      sourceURL(item.license?.url),
    ]
      .filter(Boolean)
      .join(" · ");
    for (const meaning of (Array.isArray(item.meanings)
      ? item.meanings
      : []
    ).slice(0, 20)) {
      if (!meaning || typeof meaning !== "object") continue;
      for (const def of (Array.isArray(meaning.definitions)
        ? meaning.definitions
        : []
      ).slice(0, 30)) {
        if (!def || typeof def !== "object") continue;
        const englishDefinition = cleanText(def.definition),
          pos = cleanText(meaning.partOfSpeech, 100);
        if (
          !englishDefinition ||
          seen.has(JSON.stringify([pos, englishDefinition]))
        )
          continue;
        seen.add(JSON.stringify([pos, englishDefinition]));
        candidates.push({
          english: query,
          englishDefinition,
          definitionSource: attribution,
          pos,
          meaning: "",
          meaningSource: "",
          example: cleanText(def.example),
          origin: "免费在线词典",
          online: true,
        });
        if (candidates.length === 40) return candidates;
      }
    }
  }
  return candidates;
}
// Named/numeric HTML entities may occur in translations; callers always render as text.
const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, code) => {
    if (code.startsWith("#")) {
      const n =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return (
      { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[
        code.toLowerCase()
      ] ?? all
    );
  });
export function parseTranslation(data) {
  if (Number(data?.responseStatus) !== 200 || data?.quotaFinished)
    throw new Error("中文翻译服务暂不可用或额度已用完，请手动填写中文。");
  const translated = decodeEntities(
    cleanText(data?.responseData?.translatedText),
  );
  if (!translated || !/\p{Script=Han}/u.test(translated))
    throw new Error("未获得可靠的中文参考，请手动填写中文。");
  return translated;
}
async function requestJSON(fetcher, url, signal) {
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.any([
        AbortSignal.timeout(10000),
        ...(signal ? [signal] : []),
      ]),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`服务返回 ${response.status}`);
    const raw = await response.text();
    if (raw.length > 1024 * 1024) throw new Error("返回内容过大");
    return JSON.parse(raw);
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(
      "在线词典或翻译服务无法连接，请检查网络后重试，也可手动填写。",
      { cause: err },
    );
  }
}
export function createFreeDictionary(fetcher = globalThis.fetch) {
  return {
    async definitions(value, signal) {
      const query = dictionaryQuery(value);
      const data = await requestJSON(
        fetcher,
        "https://api.dictionaryapi.dev/api/v2/entries/en/" +
          encodeURIComponent(query),
        signal,
      );
      return data === null ? [] : parseDefinitions(data, query);
    },
    async translate(value, signal) {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        new TextEncoder().encode(value).length > 500
      )
        throw new Error("此条英英释义超过免费翻译长度限制，请手动填写中文。");
      const url = new URL("https://api.mymemory.translated.net/get");
      url.searchParams.set("q", value);
      url.searchParams.set("langpair", "en|zh-CN");
      return parseTranslation(await requestJSON(fetcher, url.href, signal));
    },
  };
}
