import { dictionaryQuery, collinsURL, localDefinitions } from "./dictionary.js";
const escape = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const instances = new WeakMap();

export function attachDictionary(dialog, getVocabulary) {
  instances.get(dialog)?.();
  const box = dialog.querySelector("#v-dictionary");
  if (!box) return;
  const field = (name) => dialog.querySelector(`[name="${name}"]`);
  let candidates = [],
    query = "",
    active = true;
  function sync() {
    if (!active) return;
    try {
      query = dictionaryQuery(field("english").value);
      if (field("category").value === "sentence")
        throw new Error("难句可手动补充英英释义；查词用于生词和短词组。");
      candidates = localDefinitions(getVocabulary(), query);
      box.innerHTML = `<div class="actions"><a class="dictionary-link" href="${escape(collinsURL(query))}" target="_blank" rel="noopener noreferrer">在柯林斯查这个词 ↗</a></div><p class="help">柯林斯在新页面打开；不会自动抓取或填入官网释义。</p><div id="v-dictionary-results">${resultsHTML()}</div>`;
    } catch (err) {
      candidates = [];
      box.innerHTML = `<p class="help">${escape(err.message)}</p>`;
    }
  }
  function resultsHTML() {
    return candidates.length
      ? `<p class="help">找到 ${candidates.length} 个本机词义，请按当前语境选择。</p>` +
          candidates
            .map(
              (c, i) =>
                `<article class="dictionary-result"><strong>${escape(c.pos || "词义")} · ${escape(c.meaning)}</strong><p>${escape(c.englishDefinition)}</p><p class="help">${escape(c.origin)}</p><button type="button" data-dictionary-apply="${i}">填入第 ${i + 1} 个词义</button></article>`,
            )
            .join("")
      : '<p class="help">本机尚无这个词的记录。</p>';
  }
  function change(e) {
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
  function click(e) {
    const b = e.target.closest("[data-dictionary-apply]");
    if (!b || !box.contains(b)) return;
    const candidate = candidates[Number(b.dataset.dictionaryApply)];
    if (!candidate || dictionaryQuery(field("english").value) !== query) return;
    const values = {
      meaning: candidate.meaning,
      englishDefinition: candidate.englishDefinition,
      definitionSource: candidate.definitionSource,
      meaningSource: candidate.meaningSource,
      pos: field("category").value === "word" ? candidate.pos : "",
    };
    const overwrites = ["meaning", "englishDefinition", "pos"].filter(
      (k) =>
        field(k).value.trim() && field(k).value.trim() !== values[k].trim(),
    );
    if (
      overwrites.length &&
      !confirm("这会替换已填写的释义、词性或例句。确认使用所选词义？")
    )
      return;
    for (const [k, value] of Object.entries(values)) field(k).value = value;
    if (!field("example").value.trim() && candidate.example)
      field("example").value = candidate.example;
    const status = document.createElement("p");
    status.className = "help";
    status.textContent = "所选词义已填入，请核对后保存卡片。";
    box.querySelector("#v-dictionary-results").replaceChildren(status);
  }
  function dispose() {
    active = false;
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
