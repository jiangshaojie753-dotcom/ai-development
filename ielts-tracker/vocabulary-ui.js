import {
  TYPES,
  REASONS,
  GRADES,
  MODES,
  entry,
  addEntries,
  editCard,
  schedule,
  reviewCard,
  vocabularyStats,
  parseVocabulary,
  exportVocabulary,
  restoreVocabularyFile,
  vocabularyCSV,
  localDay,
} from "./vocabulary.js";
import { attachDictionary } from "./dictionary-ui.js";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  listening: "Listening · 听力",
  reading: "Reading · 阅读",
  speaking: "Speaking · 口语",
  writing: "Writing · 写作",
};
const definitionHTML = (c) =>
  `${c.englishDefinition ? `<div class="feedback"><strong>英英释义</strong><p>${esc(c.englishDefinition)}</p>${c.definitionSource ? `<p class="help">来源：${esc(c.definitionSource)}</p>` : ""}</div>` : ""}${c.meaningSource ? `<p class="help">中文参考来源：${esc(c.meaningSource)}</p>` : ""}`;
const statusLabels = { new: "未复习", learning: "学习中", mastered: "已掌握" };
const select = (name, label, options, value) =>
  `<label>${label}<select name="${name}">${Object.entries(options)
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === value ? "selected" : ""}>${v}</option>`,
    )
    .join("")}</select></label>`;
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="10000" ${extra}></label>`;
const area = (name, label, value = "", extra = "") =>
  `<label class="full">${label}<textarea name="${name}" maxlength="10000" ${extra}>${esc(value)}</textarea></label>`;
export function createVocabularyHub({
  getState,
  persist,
  notify,
  editor,
  download,
  render,
}) {
  let tab = "library",
    category = "all",
    reason = "all",
    status = "all",
    query = "",
    days = 7,
    mode = "en",
    session = null;
  let draft = [],
    raw = "",
    imageURL = null,
    imageName = "",
    restorePending = null,
    photoGeneration = 0;
  const main = document.querySelector("#main");
  const v = () => getState().vocabulary;
  function refresh() {
    const active = document.activeElement,
      selector = main.contains(active)
        ? active.id
          ? "#" + CSS.escape(active.id)
          : active.name
            ? '[name="' + CSS.escape(active.name) + '"]'
            : null
        : null;
    render();
    if (selector) main.querySelector(selector)?.focus({ preventScroll: true });
  }
  const commit = (next, message) =>
    persist({ ...getState(), vocabulary: next }, message);
  function fields(e = {}) {
    return (
      select("category", "分类", TYPES, e.category ?? "word") +
      select("sourceSkill", "来源科目", labels, e.sourceSkill ?? "reading") +
      area("english", "英文原文", e.english ?? "", "required") +
      '<section id="v-dictionary" class="full dictionary-panel" aria-label="词典辅助" aria-live="polite"></section>' +
      area("meaning", "中文释义", e.meaning ?? "", "required") +
      area(
        "englishDefinition",
        "英英释义（用英文解释意思）",
        e.englishDefinition ?? "",
      ) +
      input(
        "definitionSource",
        "英英释义来源（可选）",
        e.definitionSource ?? "",
      ) +
      input("meaningSource", "中文释义来源（可选）", e.meaningSource ?? "") +
      input("pos", "词性（仅生词）", e.pos ?? "") +
      select("reason", "为什么没理解", REASONS, e.reason ?? "other") +
      area("keyPoints", "关键短语 / 难点及含义", e.keyPoints ?? "") +
      input("material", "来源材料（可选）", e.material ?? "") +
      input("question", "题号（可选）", e.question ?? "") +
      area("example", "例句", e.example ?? "") +
      area("explanation", "例句 / 难点解释", e.explanation ?? "") +
      input(
        "addedDate",
        "添加日期",
        e.addedDate ?? localDay(),
        "date",
        "required",
      ) +
      `<input type="hidden" name="parentId" value="${esc(e.parentId ?? "")}"><p class="help full">掌握状态和下次复习日期由实际复习反馈计算。原始来源会保留；相同词义的不同语境归入同一卡片。</p>`
    );
  }
  function fromForm(f) {
    return entry({
      ...f,
      pos: f.category === "word" ? f.pos : "",
      parentId: f.parentId || null,
    });
  }
  function cardEditor(id, parentId) {
    const c = v().cards.find((x) => x.id === id),
      parent = v().cards.find((x) => x.id === parentId);
    const initial = c
      ? {
          ...Object.fromEntries(
            [
              "category",
              "english",
              "meaning",
              "englishDefinition",
              "definitionSource",
              "meaningSource",
              "pos",
              "keyPoints",
              "reason",
              "sourceSkill",
              "material",
              "question",
              "example",
              "explanation",
              "addedDate",
            ].map((k) => [k, c[k]]),
          ),
          parentId: c.occurrences.find((o) => o.parentId)?.parentId,
        }
      : parent
        ? {
            category: "phrase",
            sourceSkill: parent.sourceSkill,
            material: parent.material,
            question: parent.question,
            example: parent.english,
            reason: parent.reason,
            parentId: parent.id,
          }
        : {};
    editor(
      c ? "编辑知识卡片" : parent ? "从原句提取词汇 / 词组" : "添加知识卡片",
      fields(initial),
      (f) => {
        const e = fromForm(f);
        if (c)
          return commit(editCard(v(), id, e), "知识卡片已更新，原语境已保留。");
        const result = addEntries(v(), [e]);
        return commit(
          result.vocabulary,
          `已保存：新增 ${result.counts.added} 张卡，新增 ${result.counts.contexts} 个语境，重复 ${result.counts.duplicates} 条。`,
        );
      },
    );
    attachDictionary(document.querySelector("#editor"), v);
  }
  function cardsHTML() {
    const rows = v().cards.filter(
      (c) =>
        !c.archived &&
        (category === "all" || category === c.category) &&
        (reason === "all" ||
          c.reason === reason ||
          c.occurrences.some((o) => o.reason === reason)) &&
        (status === "all" || schedule(v(), c).status === status) &&
        JSON.stringify(c)
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
    return rows.length
      ? `<div class="error-grid">${rows
          .map((c) => {
            const s = schedule(v(), c),
              parents = [
                ...new Set(
                  c.occurrences.map((o) => o.parentId).filter(Boolean),
                ),
              ];
            return `<article class="error-card vocab-card"><div class="session-header"><span class="pill">${TYPES[c.category]} ${esc(c.pos)}</span><span class="pill">${statusLabels[s.status]}</span></div><h2>${esc(c.english)}</h2><p>${esc(c.meaning)}</p>${definitionHTML(c)}${c.keyPoints ? `<p class="feedback">关键短语 / 难点：${esc(c.keyPoints)}</p>` : ""}<p class="tip">${labels[c.sourceSkill]} · ${esc(c.material)} ${esc(c.question)} · ${REASONS[c.reason]}</p><p class="tip">添加 ${c.addedDate} · 下次复习 ${s.nextDate} · ${c.occurrences.length} 次出现</p>${parents
              .map((id) => {
                const p = v().cards.find((x) => x.id === id);
                return `<p class="tip">关联原句：${esc(p?.english ?? "原句不存在")}${p?.archived ? "（已删除）" : ""}</p>`;
              })
              .join(
                "",
              )}<details><summary>来源、语境和不同释义（${c.occurrences.length}）</summary>${c.occurrences.map((o) => `<div class="feedback"><strong>${esc(o.meaning)}</strong>${definitionHTML(o)}<br>${labels[o.sourceSkill]} · ${esc(o.material)} ${esc(o.question)} · ${o.addedDate}<br>${REASONS[o.reason]}<br>${esc(o.keyPoints)}<br>${esc(o.example)}<br>${esc(o.explanation)}</div>`).join("")}</details><div class="actions"><button data-v-action="edit" data-id="${esc(c.id)}">编辑</button>${c.category === "sentence" ? `<button data-v-action="extract" data-id="${esc(c.id)}">提取词汇 / 词组</button>` : ""}<button class="danger" data-v-action="delete" data-id="${esc(c.id)}">删除</button></div></article>`;
          })
          .join("")}</div>`
      : '<section class="panel empty"><h2>还没有符合条件的积累</h2><p>添加第一张知识卡片，或导入 ChatGPT 整理后的笔记。</p></section>';
  }
  function library() {
    return `<div class="filters vocab-filters"><label>搜索<input id="v-search" value="${esc(query)}" placeholder="英文、中文、材料或语境"></label>${select("v-category", "分类", { all: "全部分类", ...TYPES }, category)}${select("v-reason", "理解障碍", { all: "全部原因", ...REASONS }, reason)}${select("v-status", "掌握状态", { all: "全部状态", ...statusLabels }, status)}</div><div id="v-card-list">${cardsHTML()}</div>`;
  }
  function imports() {
    return `<section class="panel"><h2>手写笔记 → 知识卡片</h2><p class="tip">选择照片在本页对照。免费方案：自行把图片上传给 ChatGPT，再将识别后的 JSON 或文本粘贴到下方。本站不发送照片，也不自动识别；请核对手写英文与中文释义。</p><div class="form-grid" style="margin-top:16px"><label>电脑上传图片<input id="v-photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label>手机拍照<input id="v-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label></div><p class="help">JPG / PNG / WEBP，最大 10 MB。图片仅临时预览，刷新或清除后移除，不进入学习备份。</p><div id="v-photo-preview">${photo()}</div><button disabled>直接识别：OCR 服务未配置</button><details><summary>ChatGPT 提示词与导入格式</summary><pre class="code">请识别我上传的手写英文和中文。只输出 {"vocabularyVersion":1,"entries":[...]}。
每条填写 category（word/phrase/sentence）、english、meaning、sourceSkill（listening/reading/speaking/writing）。
可选 englishDefinition（英英释义）、definitionSource（英英释义来源）、meaningSource（中文释义来源）、pos、keyPoints、reason、material、question、example、explanation、addedDate（YYYY-MM-DD）。
reason 取 unknown_word/unknown_phrase/listening/reading/grammar/other。
保留不同词义和语境。不能辨认的原文或释义留空，交给我人工核对，不猜测。</pre><p class="help">纯文本每行：分类[TAB]英文[TAB]中文[TAB]科目（可省略，默认 reading，可在预览更正）。自由段落不会自动猜测字段。JSON 每批最多 500 条。</p></details><label>识别后的 JSON 或 Tab 分隔文本<textarea id="v-raw" class="json-area">${esc(raw)}</textarea></label><div class="actions"><button class="primary" data-v-action="parse">生成逐条预览</button><button data-v-action="cancel-import">取消整批</button></div></section><div id="v-draft">${draftHTML()}</div>`;
  }
  function photo() {
    return imageURL
      ? `<figure class="v-photo"><img src="${esc(imageURL)}" alt="本次手写笔记预览"><figcaption>${esc(imageName)}</figcaption><button data-v-action="clear-photo">清除图片</button></figure>`
      : "";
  }
  function draftHTML() {
    return draft.length
      ? `<section class="panel"><h2>逐条确认（${draft.length} 条）</h2><p class="help">每条都需要确认。可编辑、更改分类或移除；整批确认之前不会写入学习记录。</p>${draft.map((d, i) => `<article class="review"><div class="session-header"><strong>${i + 1}. ${esc(d.row.english || "原文待更正")}</strong><span class="pill">${esc(TYPES[d.row.category] || "分类待更正")}</span></div><p>${esc(d.row.meaning || "释义待更正")}</p><p class="help">${esc(labels[d.row.sourceSkill] || "科目待更正")} · ${esc(d.row.material || "")} · ${esc(d.row.addedDate || "确认时使用今天")}</p><details><summary>全部字段</summary><pre class="code">${esc(JSON.stringify(d.row, null, 2))}</pre></details><div class="actions"><button data-v-action="draft-edit" data-index="${i}">编辑第 ${i + 1} 条</button><button data-v-action="draft-confirm" data-index="${i}" ${d.confirmed ? "disabled" : ""}>${d.confirmed ? "已确认" : `确认第 ${i + 1} 条`}</button><button class="danger" data-v-action="draft-remove" data-index="${i}">移除第 ${i + 1} 条</button></div></article>`).join("")}<button class="primary" data-v-action="import" ${draft.every((x) => x.confirmed) ? "" : "disabled"}>导入全部已确认条目</button></section>`
      : "";
  }
  function review() {
    let body = "";
    if (session) {
      const c = v().cards.find(
        (c) => c.id === session.ids[session.index] && !c.archived,
      );
      if (!c)
        body =
          '<div class="empty"><h2>本轮复习已完成</h2><p>反馈已保存，下次复习日期已安排。</p></div>';
      else
        body = `<article class="v-review"><span class="eyebrow">${session.index + 1} / ${session.ids.length} · ${MODES[session.mode]}</span><h2>${esc(session.mode === "zh" ? c.meaning : c.english)}</h2>${session.mode === "phrase" ? "<p>请先解释句中的关键短语，再翻看答案。</p>" : ""}${
          session.revealed
            ? `<div class="feedback"><strong>${esc(session.mode === "zh" ? c.english : c.meaning)}</strong>${definitionHTML(c)}<p>${esc(c.keyPoints)}</p><p>${esc(c.example)}</p><p>${esc(c.explanation)}</p></div><p class="tip">按刚才的回忆情况反馈；同一卡片每天只记录一次。</p><div class="actions">${Object.entries(
                GRADES,
              )
                .map(
                  ([k, l]) =>
                    `<button data-v-action="grade" data-grade="${k}">${l}</button>`,
                )
                .join("")}</div>`
            : '<button class="primary" data-v-action="reveal">显示答案</button>'
        }</article>`;
    }
    return `<section class="panel"><h2>今日间隔复习</h2><p class="tip">未复习卡片从添加日进入待复习。反馈安排 1 / 2 / 4 / 7 天起步间隔；连续两个不同日期反馈“熟练”才标记掌握。</p><div class="filters">${select("v-mode", "复习方式", MODES, mode)}<button class="primary" data-v-action="start-review">开始今日待复习</button></div>${body || '<div class="empty"><p>先回忆，再揭晓答案。所有统计来自你实际提交的反馈。</p></div>'}</section>`;
  }
  function stats() {
    const s = vocabularyStats(v(), localDay(), days),
      max = Math.max(1, ...s.daily.map((x) => x.count));
    return `<section class="panel"><div class="panel-head"><h2>复习趋势</h2><div class="actions">${[7, 30].map((n) => `<button data-v-action="period" data-days="${n}" aria-pressed="${days === n}">${n} 天</button>`).join("")}</div></div><div class="chart" role="img" aria-label="每日实际完成的复习卡片数">${s.daily.map((d, i) => `<div class="bar-group" title="${d.date}: ${d.count} 张"><div class="bar" style="height:${(d.count / max) * 130}px"></div><span class="bar-date">${days === 7 || i % 6 === 0 || i === days - 1 ? d.date.slice(5) : ""}</span></div>`).join("")}</div><details><summary>每日复习数量</summary>${s.daily.map((d) => `<div>${d.date} · ${d.count} 张</div>`).join("")}</details><h3>各类内容掌握率</h3>${Object.entries(
      s.rates,
    )
      .map(
        ([k, r]) =>
          `<div class="share-row">${TYPES[k]}<div class="meter"><span style="width:${(r ?? 0) * 100}%"></span></div><b>${r === null ? "待积累" : `${Math.round(r * 100)}%`}</b></div>`,
      )
      .join(
        "",
      )}<p class="help">分母为当前未删除的该类卡片，分子为根据复习历史判定掌握的卡片。仅导入的卡片掌握率为 0%，不会虚构复习记录。历史完成数量包含后来删除的卡片。</p></section>`;
  }
  function data() {
    return `<section class="panel"><h2>词汇数据与备份</h2><div class="actions"><button data-v-action="export-json">导出词汇 JSON</button><button data-v-action="export-csv">导出词汇 CSV</button></div><p class="tip">JSON 包含所有来源、关联和复习历史，支持完整恢复词汇模块。CSV 用于查看；全站备份在“数据与同步”，包含原有学习记录和词汇模块。</p><label>恢复词汇 JSON（只替换词汇模块）<input id="v-restore" type="file" accept=".json,application/json"></label>${restorePending ? `<div class="preview"><p>有效备份：${restorePending.cards.length} 张卡，${restorePending.reviews.length} 次复习。确认后先下载当前词汇备份，再替换。</p><button class="danger" data-v-action="restore">确认替换词汇数据</button><button data-v-action="cancel-restore">取消</button></div>` : ""}</section>`;
  }
  function view() {
    const s = vocabularyStats(v());
    return `<div class="page-heading"><div><span class="eyebrow">VOCABULARY HUB · V2</span><h1>把不理解，变成记得住。</h1><p>生词、词组与难句，在真实语境里积累与复习。</p></div><button class="primary" data-v-action="add">＋ 添加知识卡片</button></div><div class="stats">${[
      ["今日待复习", s.due],
      ["今日完成", s.completed],
      ["累计积累", s.total],
      ["已掌握", s.mastered],
    ]
      .map(
        ([l, n]) =>
          `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${n}<small>张</small></div></div>`,
      )
      .join("")}</div><div class="filters">${Object.entries({
      library: "知识卡片",
      import: "笔记导入",
      review: "间隔复习",
      stats: "复习统计",
      data: "导出与恢复",
    })
      .map(
        ([k, l]) =>
          `<button data-v-action="tab" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`,
      )
      .join(
        "",
      )}</div>${{ library, import: imports, review, stats, data }[tab]()}`;
  }
  main.addEventListener("input", (e) => {
    if (e.target.id === "v-search") {
      query = e.target.value;
      document.querySelector("#v-card-list").innerHTML = cardsHTML();
    }
    if (e.target.id === "v-raw") {
      raw = e.target.value;
      draft = [];
      document.querySelector("#v-draft").innerHTML = "";
    }
  });
  main.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.name === "v-category") {
      category = el.value;
      refresh();
    }
    if (el.name === "v-reason") {
      reason = el.value;
      refresh();
    }
    if (el.name === "v-status") {
      status = el.value;
      refresh();
    }
    if (el.name === "v-mode") {
      mode = el.value;
      session = null;
      refresh();
    }
    try {
      if (["v-photo", "v-camera"].includes(el.id) && el.files[0]) {
        const generation = ++photoGeneration;
        const file = el.files[0];
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error("请选择不超过 10 MB 的 JPG / PNG / WEBP 图片");
        const url = URL.createObjectURL(file);
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          if (img.width * img.height > 40000000)
            throw new Error("图片像素过大，请选择较小照片");
        } catch (err) {
          URL.revokeObjectURL(url);
          throw err;
        }
        if (generation !== photoGeneration) {
          URL.revokeObjectURL(url);
          return;
        }
        if (imageURL) URL.revokeObjectURL(imageURL);
        imageURL = url;
        imageName = file.name;
        document.querySelector("#v-photo-preview").innerHTML = photo();
      }
      if (el.id === "v-restore" && el.files[0]) {
        restorePending = null;
        if (el.files[0].size > 20 * 1024 * 1024)
          throw new Error("备份最大 20 MB");
        restorePending = restoreVocabularyFile(await el.files[0].text());
        refresh();
      }
    } catch (err) {
      if (el.id === "v-restore") refresh();
      notify(err.message, true);
    }
  });
  main.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v-action]");
    if (!b) return;
    try {
      const a = b.dataset.vAction,
        id = b.dataset.id,
        index = Number(b.dataset.index);
      if (a === "tab") {
        tab = b.dataset.tab;
        refresh();
      }
      if (a === "add") cardEditor();
      if (a === "edit") cardEditor(id);
      if (a === "extract") cardEditor(null, id);
      if (
        a === "delete" &&
        confirm(
          "删除这张卡片？卡片将退出积累与复习列表；历史复习和关联会保留在备份中。",
        )
      ) {
        const next = structuredClone(v());
        next.cards.find((c) => c.id === id).archived = true;
        if (commit(next, "卡片已删除，历史记录已保留。")) refresh();
      }
      if (a === "parse") {
        draft = parseVocabulary(raw).map((row) => ({ row, confirmed: false }));
        refresh();
      }
      if (a === "draft-edit") {
        editor("核对导入条目", fields(draft[index].row), (f) => {
          draft[index] = { row: fromForm(f), confirmed: false };
          return true;
        });
        attachDictionary(document.querySelector("#editor"), v);
      }
      if (a === "draft-confirm") {
        draft[index].row = entry(draft[index].row);
        addEntries(v(), [draft[index].row]);
        draft[index].confirmed = true;
        refresh();
      }
      if (a === "draft-remove") {
        draft.splice(index, 1);
        refresh();
      }
      if (a === "cancel-import") {
        photoGeneration++;
        draft = [];
        raw = "";
        if (imageURL) URL.revokeObjectURL(imageURL);
        imageURL = null;
        refresh();
      }
      if (a === "import") {
        if (!draft.length || !draft.every((d) => d.confirmed))
          throw new Error("请逐条确认后再导入");
        const result = addEntries(
          v(),
          draft.map((d) => d.row),
        );
        if (
          commit(
            result.vocabulary,
            `导入完成：新增 ${result.counts.added} 张，新增语境 ${result.counts.contexts} 条，跳过重复 ${result.counts.duplicates} 条。`,
          )
        ) {
          draft = [];
          raw = "";
          refresh();
        }
      }
      if (a === "clear-photo") {
        photoGeneration++;
        if (imageURL) URL.revokeObjectURL(imageURL);
        imageURL = null;
        refresh();
      }
      if (a === "start-review") {
        const day = localDay(),
          ids = v()
            .cards.filter(
              (c) =>
                !c.archived &&
                schedule(v(), c).nextDate <= day &&
                !v().reviews.some((r) => r.cardId === c.id && r.date === day) &&
                (mode !== "zh" || c.category !== "sentence") &&
                (mode !== "phrase" ||
                  (c.category === "sentence" && c.keyPoints.trim())),
            )
            .map((c) => c.id);
        session = { ids, index: 0, revealed: false, mode };
        if (!ids.length)
          notify("当前模式没有待复习卡片，可切换模式查看其他内容。");
        refresh();
      }
      if (a === "reveal" && session) {
        session.revealed = true;
        refresh();
      }
      if (a === "grade") {
        if (!session?.revealed) throw new Error("先回忆并显示答案，再提交反馈");
        const next = reviewCard(
          v(),
          session.ids[session.index],
          b.dataset.grade,
          session.mode,
        );
        if (commit(next, "复习反馈已保存，下次复习时间已更新。")) {
          session.index++;
          session.revealed = false;
          refresh();
        }
      }
      if (a === "period") {
        days = Number(b.dataset.days);
        refresh();
      }
      if (a === "export-json")
        download(
          `ielts-vocabulary-${localDay()}.json`,
          JSON.stringify(exportVocabulary(v()), null, 2),
        );
      if (a === "export-csv")
        download(
          `ielts-vocabulary-${localDay()}.csv`,
          vocabularyCSV(v()),
          "text/csv;charset=utf-8",
        );
      if (a === "cancel-restore") {
        restorePending = null;
        refresh();
      }
      if (
        a === "restore" &&
        restorePending &&
        confirm(
          "确认只替换词汇卡片与复习历史？每日打卡、成绩、纠错和学习报告保持不变。",
        )
      ) {
        download(
          `ielts-vocabulary-before-restore-${localDay()}.json`,
          JSON.stringify(exportVocabulary(v()), null, 2),
        );
        if (commit(restorePending, "词汇备份已恢复；其余学习数据保持不变。")) {
          restorePending = null;
          session = null;
          refresh();
        }
      }
    } catch (err) {
      notify(err.message, true);
    }
  });
  window.addEventListener("beforeunload", () => {
    if (imageURL) URL.revokeObjectURL(imageURL);
  });
  return { render: view };
}
