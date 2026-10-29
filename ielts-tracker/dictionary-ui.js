import {
  dictionaryQuery,
  collinsURL,
  localDefinitions,
  createFreeDictionary,
} from "./dictionary.js";
const escape = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const instances = new WeakMap();
// Explicit opt-in lasts for this page session, never silently enabled on a new visit.
let autoLookup = false;

export function attachDictionary(dialog, getVocabulary) {
  instances.get(dialog)?.();
  const box = dialog.querySelector("#v-dictionary");
  if (!box) return;
  const field = (name) => dialog.querySelector(`[name="${name}"]`);
  const service = createFreeDictionary();
  let candidates = [],
    query = "",
    active = true,
    busy = false;
  let notice = "",
    wordMeaning = "",
    controller = null,
    generation = 0,
    formVersion = 0,
    timer = null;
  const valid = (token) => active && dialog.open && token === generation;
  function stop() {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
    generation++;
    busy = false;
  }
  function draw() {
    if (!active) return;
    box.innerHTML = `<div class="actions"><button type="button" class="primary" data-dictionary-action="lookup" ${busy ? "disabled" : ""}>匹配中英释义</button><a class="dictionary-link" href="${escape(collinsURL(query))}" target="_blank" rel="noopener noreferrer">柯林斯官网 ↗</a>${busy ? '<button type="button" data-dictionary-action="cancel">停止查询</button>' : ""}</div>
      <label class="dictionary-auto"><input type="checkbox" id="v-dictionary-auto" ${autoLookup ? "checked" : ""}>停止输入后自动联网查词</label>
      <p class="help">英英来源：Free Dictionary API；中文：MyMemory 翻译参考。仅发送查询词和选中的公共释义，第三方可能保留查询；不发送学习记录。</p>
      <p class="help">柯林斯官方接口尚未授权，链接在新页面打开官网。</p>
      <div id="v-dictionary-status" role="status">${notice ? `<p class="help">${escape(notice)}</p>` : ""}</div>
      ${wordMeaning ? `<p class="dictionary-reference"><strong>单词中文参考：</strong>${escape(wordMeaning)}<br><small>可能包含其他词义；选择下方英英释义后，再匹配该词义的中文。</small></p>` : ""}
      <div id="v-dictionary-results" aria-busy="${busy}">${resultsHTML()}</div>`;
  }
  function resultsHTML() {
    if (!candidates.length)
      return '<p class="help">本机暂无匹配词义，可点击“匹配中英释义”联网查询。</p>';
    return candidates
      .map(
        (c, i) =>
          `<article class="dictionary-result"><strong>${escape(c.pos || "词义")}${c.meaning ? ` · ${escape(c.meaning)}` : ""}</strong>${c.englishDefinition ? `<p>${escape(c.englishDefinition)}</p>` : ""}${c.example ? `<p class="help">例句：${escape(c.example)}</p>` : ""}<p class="help">${escape(c.origin)}</p>${c.definitionSource ? `<details><summary>词典来源与许可</summary><p class="help">${escape(c.definitionSource)}</p></details>` : ""}<button type="button" data-dictionary-apply="${i}" ${busy ? "disabled" : ""}>${c.chineseOnly ? "仅填入中文参考" : c.online ? `选择第 ${i + 1} 个词义并填入` : `填入第 ${i + 1} 个词义`}</button></article>`,
      )
      .join("");
  }
  function sync() {
    stop();
    wordMeaning = "";
    notice = "";
    candidates = [];
    if (!active) return;
    try {
      query = dictionaryQuery(field("english").value);
      if (field("category").value === "sentence")
        throw new Error("难句可手动补充英英释义；查词用于生词和短词组。");
      candidates = localDefinitions(getVocabulary(), query);
      draw();
      if (autoLookup) timer = setTimeout(lookup, 800);
    } catch (err) {
      query = "";
      box.innerHTML = `<p class="help">${escape(err.message)}</p>`;
    }
  }
  async function lookup() {
    if (!active || !query || !dialog.open) return;
    stop();
    controller = new AbortController();
    const token = generation,
      signal = controller.signal,
      requested = query;
    candidates = localDefinitions(getVocabulary(), requested);
    wordMeaning = "";
    busy = true;
    notice = "正在匹配词义…";
    draw();
    const [definitions, translation] = await Promise.allSettled([
      service.definitions(requested, signal),
      service.translate(requested, signal),
    ]);
    if (!valid(token)) return;
    const messages = [];
    if (definitions.status === "fulfilled")
      candidates.push(...definitions.value);
    else messages.push(definitions.reason.message);
    if (translation.status === "fulfilled") wordMeaning = translation.value;
    else messages.push(translation.reason.message);
    if (wordMeaning && !candidates.some((c) => c.online))
      candidates.push({
        meaning: wordMeaning,
        englishDefinition: "",
        definitionSource: "",
        pos: "",
        example: "",
        meaningSource: "MyMemory · 单词中文翻译参考（请核对）",
        origin: "中文翻译参考；未匹配到英英词典释义",
        chineseOnly: true,
      });
    busy = false;
    notice = messages.length
      ? [...new Set(messages)].join(" ")
      : candidates.length
        ? "请按当前语境选择词义；保存前可更正中文和英英释义。"
        : "未查到这个词，请检查拼写、改用原形，或手动填写。";
    draw();
  }
  function change(e) {
    if (e.target.id === "v-dictionary-auto") {
      autoLookup = e.target.checked;
      if (autoLookup) sync();
      else {
        stop();
        notice = "已关闭自动联网查词。";
        draw();
      }
      return;
    }
    formVersion++;
    if (["english", "category"].includes(e.target.name)) sync();
    const source = {
      englishDefinition: "definitionSource",
      meaning: "meaningSource",
    }[e.target.name];
    if (
      source &&
      field(source).value &&
      !field(source).value.endsWith("（已编辑）")
    )
      field(source).value = field(source).value.slice(0, 9900) + "（已编辑）";
  }
  function fillCandidate(candidate, warning = "") {
    const values = candidate.chineseOnly
      ? { meaning: candidate.meaning, meaningSource: candidate.meaningSource }
      : {
          englishDefinition: candidate.englishDefinition,
          definitionSource: candidate.definitionSource,
          pos: field("category").value === "word" ? candidate.pos : "",
          ...(candidate.meaning
            ? {
                meaning: candidate.meaning,
                meaningSource: candidate.meaningSource,
              }
            : {}),
        };
    const overwrites = ["meaning", "englishDefinition", "pos"].filter(
      (k) =>
        k in values &&
        field(k).value.trim() &&
        field(k).value.trim() !== values[k].trim(),
    );
    if (
      overwrites.length &&
      !confirm("这会替换已填写的释义或词性。确认使用所选词义？")
    ) {
      notice = "已取消填入，原有内容保持不变。";
      draw();
      return;
    }
    for (const [k, value] of Object.entries(values)) field(k).value = value;
    if (!field("example").value.trim() && candidate.example)
      field("example").value = candidate.example;
    formVersion++;
    notice = warning || "所选词义已填入，请核对后保存卡片。";
    draw();
  }
  async function click(e) {
    const b = e.target.closest(
      "[data-dictionary-action], [data-dictionary-apply]",
    );
    if (!b || !box.contains(b)) return;
    if (b.dataset.dictionaryAction === "lookup") return lookup();
    if (b.dataset.dictionaryAction === "cancel") {
      stop();
      notice = "查询已停止，已填写的内容保持不变。";
      draw();
      return;
    }
    const candidate = candidates[Number(b.dataset.dictionaryApply)];
    if (busy || !candidate || !query) return;
    if (!candidate.online) return fillCandidate(candidate);
    stop();
    controller = new AbortController();
    const token = generation,
      version = formVersion,
      selected = { ...candidate };
    busy = true;
    notice = "正在匹配所选词义的中文…";
    draw();
    let warning = "";
    try {
      selected.meaning = await service.translate(
        selected.englishDefinition,
        controller.signal,
      );
      selected.meaningSource = "MyMemory · 英英释义的中文翻译参考（请核对）";
    } catch (err) {
      warning = `${err.message} 英英释义已填入，请手动核对或补充中文。`;
    }
    if (!valid(token)) return;
    busy = false;
    if (formVersion !== version) {
      notice = "你已修改表单，未覆盖新内容。请重新选择词义。";
      draw();
      return;
    }
    fillCandidate(selected, warning);
  }
  function dispose() {
    active = false;
    stop();
    dialog.removeEventListener("input", change);
    box.removeEventListener("click", click);
    dialog.removeEventListener("close", dispose);
  }
  dialog.addEventListener("input", change);
  box.addEventListener("click", click);
  dialog.addEventListener("close", dispose);
  instances.set(dialog, dispose);
  sync();
}
