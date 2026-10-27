import {
  SKILLS,
  LABELS,
  SCORE_LABELS,
  CATEGORIES,
  today,
  uid,
  clone,
  date,
  emptyState,
  validateTask,
  validateSession,
  validateError,
  errorKey,
  parseReport,
  importReport,
  backup,
  restore,
  analytics,
  stageEvidence,
  csv,
  loadState,
  saveState,
} from "./core.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pages = {
  dashboard: "每日计划",
  training: "四科训练",
  trends: "进步趋势",
  errors: "纠错库",
  stages: "阶段复盘",
  data: "数据与同步",
};
const english = {
  dashboard: "DAILY PRACTICE",
  training: "FOUR SKILLS, ONE GOAL",
  trends: "YOUR PROGRESS",
  errors: "LEARN FROM EVERY MISTAKE",
  stages: "REFLECT & MOVE FORWARD",
  data: "YOUR DATA, YOUR CONTROL",
};
let state = emptyState(),
  storageBlocked = false,
  selectedDate = today(),
  period = 7,
  skillFilter = "all",
  errorFilter = "review";
let reportPreview = null,
  backupPreview = null,
  editorSave = null;
try {
  state = loadState(localStorage);
} catch (e) {
  storageBlocked = true;
  setTimeout(
    () =>
      notify(
        `本机存储无法读取，已暂停写入以保护原数据。请在「数据与同步」下载原始存储，再检查浏览器权限或恢复备份。${e.message}`,
        true,
      ),
    0,
  );
}
function notify(message, error = false) {
  const n = $("#notice");
  n.textContent = message;
  n.hidden = false;
  n.className = error ? "error" : "";
  n.setAttribute("role", error ? "alert" : "status");
}
function persist(next, message = "已保存在当前浏览器。") {
  if (storageBlocked) {
    notify(
      "本机存储读取异常，写入已暂停。请先导出原始存储，并在数据页恢复有效备份。",
      true,
    );
    return false;
  }
  try {
    saveState(localStorage, next);
    state = next;
    notify(message);
    return true;
  } catch {
    notify(
      "保存失败：浏览器存储空间不足或权限被禁用。当前修改未写入；请先下载完整备份。",
      true,
    );
    return false;
  }
}
function page() {
  return pages[location.hash.slice(1)] ? location.hash.slice(1) : "dashboard";
}
const pill = (skill) => `<span class="pill ${skill}">${LABELS[skill]}</span>`;
const numText = (v, unit = "") =>
  v === null || v === undefined ? "待记录" : `${v}${unit}`;
const pct = (n) =>
  n === null ? "待测" : `${(n * 100).toFixed(1).replace(".0", "")}%`;
const dateFormat = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
const actions = (html) => `<div class="actions">${html}</div>`;
const empty = (title, description, button = "", compact = false) =>
  `<div class="empty ${compact ? "compact" : ""}"><span class="empty-icon" aria-hidden="true">◷</span><h3>${title}</h3><p>${description}</p>${button}</div>`;
function heading(title, subtitle, buttons = "") {
  return `<div class="page-heading"><div><span class="eyebrow">${english[page()]}</span><h1>${title}</h1><p>${subtitle}</p></div>${actions(buttons)}</div>`;
}
function stat(label, value, unit, foot, icon) {
  return `<div class="stat"><div class="stat-label">${label}<span aria-hidden="true">${icon}</span></div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`;
}
function skillCards() {
  return `<div class="skill-grid">${SKILLS.map((skill) => {
    const rows = state.sessions
      .filter((x) => x.skill === skill && x.date <= selectedDate)
      .sort((a, b) => b.date.localeCompare(a.date));
    const recent = rows[0];
    const score = !recent
      ? "待测"
      : recent.correct !== null
        ? pct(recent.correct / recent.total)
        : recent.band !== null
          ? `${recent.band} <small>Band</small>`
          : recent.questions !== null
            ? `${recent.questions} <small>问题</small>`
            : "已记录";
    return `<article class="skill-card"><div class="skill-initial pill ${skill}">${skill[0].toUpperCase()}</div><h3>${LABELS[skill]}<small>${skill[0].toUpperCase() + skill.slice(1)}</small></h3><div class="score">${score}</div><p>${recent ? esc(SCORE_LABELS[recent.scoreType]) : "还没有训练记录"}</p><small>${recent ? esc(recent.date) : "从第一次练习开始"}</small><div class="footline"><span>Stage ${state.stages[skill].level}</span><button class="text-button" data-action="session" data-skill="${skill}">记录训练 ↗</button></div></article>`;
  }).join("")}</div>`;
}
function chart(a) {
  if (!a.daily.some((d) => d.minutes !== null))
    return empty(
      "还没有时长记录",
      "实际时长未知时保留为空，补录后即可看到趋势。",
      "",
      true,
    );
  const max = Math.max(1, ...a.daily.map((d) => d.minutes ?? 0));
  return `<div class="chart" role="img" aria-label="每日已记录学习分钟数；详细数据见下方表格">${a.daily.map((d, i) => `<div class="bar-group" title="${d.date}：${d.minutes === null ? "无时长记录" : `${d.minutes} 分钟`}"><div class="bar" style="height:${d.minutes === null ? 0 : Math.max(1, (d.minutes / max) * 130)}px;opacity:${d.minutes === null ? 0 : 1}"></div><span class="bar-date">${a.daily.length <= 7 || i === 0 || i === a.daily.length - 1 || i % Math.ceil(a.daily.length / 5) === 0 ? d.date.slice(5) : ""}</span></div>`).join("")}</div><div class="chart-description"><span>柱高按已记录时长显示</span><span>分钟 / 天</span></div><details><summary>查看每日数据（含未知项）</summary>${a.daily.map((d) => `<div class="session-meta">${d.date} · ${d.minutes === null ? "无时长记录" : `${d.minutes} 分钟`} ${d.unknown ? `· ${d.unknown} 项时长未知` : ""}</div>`).join("")}</details>`;
}
function completionChart(a) {
  if (!a.daily.some((d) => d.completion !== null))
    return empty(
      "还没有计划完成记录",
      "添加每日任务并更新完成状态，即可查看每天的计划完成率。",
      "",
      true,
    );
  return `<div class="chart" role="img" aria-label="每日任务完成率；详细数据见下方列表">${a.daily.map((d, i) => `<div class="bar-group" title="${d.date}：${d.completion === null ? "无计划" : pct(d.completion)}"><div class="bar" style="height:${d.completion === null ? 0 : Math.max(1, d.completion * 130)}px;opacity:${d.completion === null ? 0 : 1}"></div><span class="bar-date">${a.daily.length <= 7 || i === 0 || i === a.daily.length - 1 || i % Math.ceil(a.daily.length / 5) === 0 ? d.date.slice(5) : ""}</span></div>`).join("")}</div><details><summary>查看每日计划完成率</summary>${a.daily.map((d) => `<div class="session-meta">${d.date} · ${d.taskCount ? `${d.completedCount}/${d.taskCount} 项 · ${pct(d.completion)}` : "无计划，不计为零完成率"}</div>`).join("")}</details>`;
}
function shares(a) {
  return SKILLS.map(
    (k) =>
      `<div class="share-row">${pill(k)}<div class="meter"><span style="width:${a.totalMinutes ? (a.bySkill[k] / a.totalMinutes) * 100 : 0}%"></span></div><b>${a.totalMinutes ? pct(a.bySkill[k] / a.totalMinutes) : "待记录"}</b></div>`,
  ).join("");
}
function taskRows(tasks) {
  return tasks
    .map(
      (t) =>
        `<article class="task-row"><input type="checkbox" data-task-toggle="${esc(t.id)}" ${t.completed ? "checked" : ""} aria-label="标记${esc(t.title)}${t.completed ? "未完成" : "完成"}"><div class="row-content"><strong>${esc(t.title)}</strong> ${pill(t.skill)}<p>计划 ${numText(t.plannedMinutes, " 分钟")} <span class="slash">/</span> 实际 ${numText(t.actualMinutes, " 分钟")}</p>${t.notes ? `<p>${esc(t.notes)}</p>` : ""}</div><div class="row-actions"><button class="text-button" data-action="edit-task" data-id="${esc(t.id)}">编辑</button><button class="text-button danger" data-action="delete-task" data-id="${esc(t.id)}">删除</button></div></article>`,
    )
    .join("");
}
function dashboard() {
  const tasks = state.tasks.filter((t) => t.date === selectedDate),
    a = analytics(state, selectedDate, 7),
    current = analytics(state, selectedDate, 1);
  const planned = tasks.filter((t) => t.plannedMinutes !== null),
    totalPlan = planned.reduce((n, t) => n + t.plannedMinutes, 0);
  return (
    heading(
      "让每一次练习，都有迹可循。",
      "把注意力放在今天，进步会在记录中慢慢发生。",
      `<label class="sr-only" for="selected-date">查看日期</label><input class="date-control" id="selected-date" type="date" value="${selectedDate}"><button class="primary" data-action="task">＋ 添加任务</button>`,
    ) +
    `<div class="hero"><div><span class="hero-note">${dateFormat(selectedDate)} · ${selectedDate === today() ? "TODAY" : "历史 / 计划"}</span><h2>${tasks.length ? `今天的计划，${tasks.filter((t) => t.completed).length} / ${tasks.length} 项已完成` : "新的一页，从一个小目标开始"}</h2><p>${tasks.length ? "真实记录实际投入，未知时长可以稍后补录。" : "添加分科任务，或从 ChatGPT 导入你的学习报告。"}</p></div><span class="hero-mark" aria-hidden="true">↗</span></div>` +
    `<div class="stats">${stat("计划学习", planned.length ? totalPlan : "—", "分钟", `${tasks.length} 项任务${tasks.some((t) => t.plannedMinutes === null) ? " · 部分计划时长未知" : ""}`, "◷")}${stat("实际投入", current.daily[0].minutes ?? "—", "分钟", current.unknown ? `${current.unknown} 项时长待补录` : "只统计已记录时长", "◴")}${stat("计划完成", tasks.length ? `${tasks.filter((t) => t.completed).length}/${tasks.length}` : "—", "项", tasks.length ? `完成率 ${pct(current.completion)}` : "尚未制定计划", "✓")}${stat("近 7 天累计", a.totalMinutes || (a.daily.some((x) => x.minutes !== null) ? 0 : "—"), "分钟", a.unknown ? `${a.unknown} 项未知时长未计入` : "持续积累，不急于求成", "↗")}</div>` +
    `<div class="grid-two"><section class="panel"><div class="panel-head"><div><h2>${selectedDate === today() ? "今日" : "当日"}学习计划</h2><p>按自己的节奏，完成每一个小目标</p></div><button class="text-button" data-action="task">＋ 添加任务</button></div>${tasks.length ? taskRows(tasks) : empty("今天准备练习什么？", "可以补录历史任务，也可以提前安排学习计划。", '<button class="secondary" data-action="task">创建第一项任务</button>')}</section><section class="panel"><div class="panel-head"><div><h2>最近 7 天</h2><p>每天的一点点，都算数</p></div><a class="text-button" href="#trends">查看趋势 ↗</a></div>${chart(a)}</section></div>` +
    `<div class="panel-head"><div><h2>四科训练概览</h2><p>独立记录每科表现，不将单次练习换算为雅思分数</p></div><a class="text-button" href="#training">全部记录 ↗</a></div>${skillCards()}<p class="tip">学习时长以每日打卡为准；当天没有任务时才计入训练时长，避免同一练习被重复累计。</p>`
  );
}
function sessionCard(s) {
  const details = [
    numText(s.minutes, " 分钟"),
    s.correct === null
      ? null
      : `${s.correct}/${s.total} · ${pct(s.correct / s.total)}`,
    s.band === null
      ? null
      : `${s.band} Band（${s.scoreType === "ai_estimate" ? "AI 参考估计" : "用户记录模考分"}）`,
    s.questions === null ? null : `${s.questions} 个口语问题`,
    s.writingTask === null
      ? null
      : s.writingTask === "task1"
        ? "Task 1"
        : "Task 2",
  ];
  return `<article class="session"><div class="session-header"><div>${pill(s.skill)} <span class="pill ${s.scoreType === "ai_estimate" ? "ai" : ""}">${SCORE_LABELS[s.scoreType]}</span><h3>${esc(s.source || "来源待补充")}${s.questionType ? ` · ${esc(s.questionType)}` : ""}</h3><div class="session-meta">${s.date} · 难度 ${esc(s.difficulty || "未知")} · ${s.timed === null ? "计时未知" : s.timed ? "计时" : "不限时"} · ${s.firstAttempt === null ? "首次作答未知" : s.firstAttempt ? "首次作答" : "重复作答"}</div></div><div class="row-actions"><button class="text-button" data-action="edit-session" data-id="${esc(s.id)}">编辑</button><button class="text-button danger" data-action="delete-session" data-id="${esc(s.id)}">删除</button></div></div><div class="session-details">${details
    .filter((x) => x !== null)
    .map((x) => `<span>${esc(x)}</span>`)
    .join(
      "",
    )}</div>${s.topic ? `<div class="feedback">话题：${esc(s.topic)}</div>` : ""}${s.feedback ? `<div class="feedback">表达 / 练习反馈：${esc(s.feedback)}</div>` : ""}${s.dimensions ? `<div class="feedback">写作维度（${s.scoreType === "ai_estimate" ? "AI 参考" : "用户记录"}）：任务回应 ${s.dimensions.taskResponse ?? "待测"} · 连贯衔接 ${s.dimensions.coherence ?? "待测"} · 词汇 ${s.dimensions.lexical ?? "待测"} · 语法 ${s.dimensions.grammar ?? "待测"}</div>` : ""}${s.improvements ? `<div class="feedback">改进建议：${esc(s.improvements)}</div>` : ""}</article>`;
}
function training() {
  const rows = state.sessions
    .filter((s) => skillFilter === "all" || s.skill === skillFilter)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    heading(
      "四科各有节奏，记录每次练习。",
      "保留练习条件，让每一次比较都有依据。",
      '<button class="primary" data-action="session">＋ 记录训练</button>',
    ) +
    skillCards() +
    `<div class="filters" style="margin-top:24px"><button data-filter="all" aria-pressed="${skillFilter === "all"}">全部科目</button>${SKILLS.map((k) => `<button data-filter="${k}" aria-pressed="${skillFilter === k}">${LABELS[k]}</button>`).join("")}</div><div class="sessions">${rows.length ? rows.map(sessionCard).join("") : `<section class="panel">${empty("还没有训练记录", "输入练习条件与结果，未知值可以留空。", '<button class="secondary" data-action="session">记录一次训练</button>')}</section>`}</div>`
  );
}
function trends() {
  const a = analytics(state, selectedDate, period);
  return (
    heading(
      "进步，藏在持续的积累里。",
      "查看真实投入与可比练习；未测科目保留为“待测”。",
      `<label class="sr-only" for="selected-date">统计截止日</label><input class="date-control" id="selected-date" type="date" value="${selectedDate}">`,
    ) +
    `<div class="filters" aria-label="统计范围">${[7, 30, 90].map((n) => `<button data-period="${n}" aria-pressed="${period === n}">最近 ${n} 天</button>`).join("")}</div>` +
    `<div class="stats">${stat("已记录学习", a.daily.some((x) => x.minutes !== null) ? a.totalMinutes : "—", "分钟", `${a.unknown} 项时长未知，不计入总数`, "◷")}${stat("计划完成率", pct(a.completion), "", "按已完成任务数 / 任务总数", "✓")}${stat("有时长的天数", a.daily.filter((d) => d.minutes !== null).length, "天", `统计截止 ${selectedDate}`, "▦")}${stat("可比数据组", a.trends.filter((g) => g.rows.length >= 2).length, "组", "至少两次且练习条件相同", "↗")}</div>` +
    `<div class="grid-two"><section class="panel"><div class="panel-head"><div><h2>学习时间趋势</h2><p>每日打卡优先；无任务的日期采用训练时长</p></div></div>${chart(a)}</section><section class="panel"><div class="panel-head"><div><h2>分科学习占比</h2><p>仅统计已知分钟数</p></div></div>${shares(a)}</section></div>` +
    `<section class="panel"><div class="panel-head"><div><h2>计划完成率趋势</h2><p>按每天已完成任务数 / 当天任务总数；没有任务的日期不计为零</p></div></div>${completionChart(a)}</section>` +
    `<section class="panel"><div class="panel-head"><div><h2>正确率趋势</h2><p>仅比较听力 / 阅读的同来源、题型、难度、计时、首次作答、成绩类型和总题数</p></div></div><p class="tip">${a.excluded} 条条件不足、重复作答或非正确率训练未参与。单次记录仍可查看，但不能形成趋势。</p>${a.trends.length ? a.trends.map((g) => `<article class="review"><h3>${esc(g.label)}</h3>${g.rows.length < 2 ? '<p class="muted">仅一次记录，等待更多可比数据。</p>' : ""}<div class="chart" role="img" aria-label="${esc(g.label)} 的正确率趋势">${g.rows.map((s) => `<div class="bar-group" title="${s.date} ${pct(s.correct / s.total)}"><small>${pct(s.correct / s.total)}</small><div class="bar" style="height:${(s.correct / s.total) * 115}px"></div><span class="bar-date">${s.date.slice(5)}</span></div>`).join("")}</div><details><summary>查看成绩明细</summary>${g.rows.map((s) => `<div>${s.date} · ${s.correct}/${s.total} · ${pct(s.correct / s.total)}</div>`).join("")}</details></article>`).join("") : empty("暂时没有可比的正确率数据", "先记录训练来源、题型、难度、计时和首次作答条件。")}</section>`
  );
}
function errorsPage() {
  const rows = state.errors.filter(
    (e) => errorFilter === "all" || e.status === errorFilter,
  );
  return (
    heading(
      "把错误，变成下一次的进步。",
      "同一原句、修改与分类跨口语 / 写作聚合；再次出现时自动回到待复习。",
      '<button class="primary" data-action="error">＋ 添加纠错</button>',
    ) +
    `<div class="filters">${[
      ["review", "待复习"],
      ["mastered", "已掌握"],
      ["all", "全部错误"],
    ]
      .map(
        ([k, v]) =>
          `<button data-error-filter="${k}" aria-pressed="${errorFilter === k}">${v} · ${state.errors.filter((e) => k === "all" || e.status === k).length}</button>`,
      )
      .join(
        "",
      )}</div><div class="error-grid">${rows.map((e) => `<article class="error-card"><div class="session-header"><span class="pill">${CATEGORIES[e.category]}</span><small>累计 ${e.occurrences.length} 次 · 复发 ${e.occurrences.length - 1} 次</small></div><p class="original"><span class="sr-only">原句：</span>${esc(e.original)}</p><p class="corrected"><span aria-hidden="true">↳ </span><span class="sr-only">修改后：</span>${esc(e.corrected)}</p><p class="explanation">${esc(e.explanation || "解释待补充")}</p><details><summary>出现记录</summary>${e.occurrences.map((o) => `<div class="session-meta">${o.date} · ${LABELS[o.skill]}</div>`).join("")}</details><div class="card-bottom"><span class="pill">${e.status === "mastered" ? "已掌握" : "待复习"}</span><div class="actions"><button class="text-button" data-action="edit-error" data-id="${esc(e.id)}">更正</button><button class="secondary" data-action="toggle-error" data-id="${esc(e.id)}">${e.status === "mastered" ? "恢复待复习" : "标记掌握"}</button></div></div></article>`).join("")}</div>${rows.length ? "" : `<section class="panel">${empty("这里是你的进步清单", "添加纠错，或导入 ChatGPT 生成的反馈报告。")}</section>`}`
  );
}
function stages() {
  return (
    heading(
      "定期回看，再向前一步。",
      "四科独立 Stage 1–4；每周复盘，每 14 天根据证据评估，升级由你确认。",
    ) +
    `<div class="stage-list">${SKILLS.map((k) => {
      const s = state.stages[k],
        e = stageEvidence(state, k, selectedDate);
      return `<article class="stage-card"><div class="panel-head"><h2>${pill(k)} Stage ${s.level}</h2><span class="pill">${s.level === 4 ? "巩固训练" : e.ready ? "可评估升级" : "继续积累"}</span></div><div class="stage-steps" aria-label="第 ${s.level} 阶段，共四阶段">${[1, 2, 3, 4].map((n) => `<span class="${n <= s.level ? "active" : ""}"></span>`).join("")}</div><p>${esc(e.reason)}</p><p>本次评估：${selectedDate} · 有效证据 ${e.count} 条 · 阶段观察 ${e.elapsed} 天</p><small>阶段用于安排训练，不代表 IELTS Band。口语 / 写作的 AI 分数始终为参考。</small><form class="stage-controls" data-stage="${k}"><label>目标阶段<select name="level">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === s.level ? "selected" : ""}>Stage ${n}</option>`).join("")}</select></label><label>变更日期<input name="date" type="date" value="${selectedDate}" required max="${today()}"></label><label>调整原因 / 训练反馈<textarea name="reason" required maxlength="10000" rows="2" placeholder="说明依据，或根据个人反馈调整训练。"></textarea></label><button type="submit">手动确认阶段调整</button></form><details><summary>查看阶段记录（${s.history.length}）</summary>${s.history.map((h) => `<p>${h.date} · Stage ${h.from} → ${h.to}<br>${esc(h.reason)}</p>`).join("") || "<p>还没有阶段变更。</p>"}</details></article>`;
    }).join(
      "",
    )}</div><section class="panel" style="margin-top:22px"><div class="panel-head"><div><h2>每周复盘</h2><p>写下有效的方法，以及下一周想调整的训练</p></div><button class="secondary" data-action="review">＋ 写复盘</button></div><div class="review-list">${
      state.reviews
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
          (r) =>
            `<article class="review"><div class="session-header"><strong>${r.date}</strong><button class="text-button" data-action="edit-review" data-id="${esc(r.id)}">编辑复盘</button></div><p>${esc(r.summary)}</p><p class="muted">训练调整：${esc(r.adjustments || "暂无")}</p></article>`,
        )
        .join("") ||
      empty("给这一周留几句话", "回顾四科表现、错题复习和学习安排。", "", true)
    }</div></section>`
  );
}
const reportTemplate = () =>
  JSON.stringify(
    {
      schemaVersion: 1,
      reportId: "请替换为唯一报告编号",
      date: selectedDate,
      tasks: [],
      sessions: [
        {
          skill: "listening",
          source: "",
          questionType: "",
          difficulty: "",
          timed: null,
          firstAttempt: null,
          scoreType: "practice",
          correct: null,
          total: null,
          minutes: null,
        },
      ],
      errors: [],
    },
    null,
    2,
  );
function dataPage() {
  reportPreview = null;
  backupPreview = null;
  return (
    heading(
      "学习数据，由你掌握。",
      "数据保存在当前浏览器；建议定期下载完整备份，换设备时手动恢复。",
    ) +
    `<div class="grid-two"><div><section class="panel"><div class="panel-head"><div><h2>导入 ChatGPT 学习报告</h2><p>校验 → 预览 → 人工确认，不会推测未知数据</p></div><span class="pill">Schema v1</span></div><label for="report-json">粘贴 JSON 报告<textarea class="json-area" id="report-json" spellcheck="false" placeholder="在这里粘贴 ChatGPT 生成的 JSON…"></textarea></label><div class="actions" style="margin-top:12px"><button class="primary" data-action="preview-report">校验并预览</button><button data-action="template">填入空白模板</button><label class="text-button">选择 JSON 文件<input id="report-file" type="file" accept=".json,application/json" class="sr-only"></label></div><p id="report-error" class="error-text" role="alert"></p><div id="report-preview"></div><details><summary>JSON 格式说明 / 复制给 ChatGPT 的要求</summary><p class="help">仅输出 JSON。schemaVersion 为 1，date 为 YYYY-MM-DD；reportId 保持稳定且唯一。所有成绩、时长、计时条件未知时用 null，不根据题数推断时长或 Band。完整规范见 <a href="./REPORT_FORMAT.md" target="_blank" rel="noopener">REPORT_FORMAT.md</a>。</p><pre class="code">${esc(reportTemplate())}</pre><p class="help">支持旧版 {date, listening:{…}, speaking:{…}} 简化结构。仅接受文档明确列出的字段；不接受口语音频、语速、发音分数等未确认指标。</p></details></section><section class="panel"><div class="panel-head"><div><h2>完整备份与恢复</h2><p>完整备份保留任务、训练、纠错、去重信息、阶段和复盘</p></div></div><div class="actions"><button class="secondary" data-action="backup">下载完整 JSON 备份</button><button data-action="csv">导出任务 / 训练 CSV</button></div><p class="tip">CSV 便于查看，完整恢复请使用 JSON 备份。下载文件包含个人学习数据，请自行安全保存，勿提交到公开仓库。</p><label style="margin-top:18px">选择完整备份文件<input id="backup-file" type="file" accept=".json,application/json"></label><p id="backup-error" class="error-text" role="alert"></p><div id="backup-preview"></div>${storageBlocked ? '<div class="alert">本机存储异常。先下载原始存储，保留恢复材料。</div><button data-action="raw-backup">下载原始存储</button>' : ""}</section></div><div><section class="panel"><div class="panel-head"><div><h2>存储状态</h2><p><span class="status-dot" style="display:inline-block"></span> ${storageBlocked ? "写入已暂停" : "仅本机存储"}</p></div><span class="pill">LOCAL FIRST</span></div><p class="help">未配置 Supabase，当前没有多端同步。学习内容不会发送到 GitHub 或 ChatGPT；此应用不会调用 AI 服务。</p><div class="share-row"><span>每日任务</span><b>${state.tasks.length} 条</b></div><div class="share-row"><span>训练记录</span><b>${state.sessions.length} 条</b></div><div class="share-row"><span>纠错条目</span><b>${state.errors.length} 条</b></div><div class="share-row"><span>已导入报告</span><b>${state.imports.length} 份</b></div><p class="tip">清除浏览器站点数据、使用隐私模式或切换域名 / 浏览器，会影响本机记录。首次在线打开后，支持离线访问。</p></section><section class="panel"><div class="panel-head"><div><h2>Supabase 云端同步</h2><p>接口预留 · 默认关闭</p></div></div><p class="help">已提供 Auth 客户端适配接口与按用户隔离的 RLS 表结构。V1 未接入登录或实际同步，没有自动上传。启用前需自行创建 Supabase 项目并验证两个账户的权限隔离。</p><a href="./README.md#supabase-预留接口" target="_blank" rel="noopener" class="text-button">查看接入说明 ↗</a><p class="tip">只允许公开的 publishable key 用于客户端；service role、secret key 不得进入前端或公开仓库。</p></section><section class="panel"><h2>离线与数据完整性</h2><p class="tip">离线缓存只保存应用文件，不缓存学习报告。未知成绩和时长显示为“待测 / 待记录”。AI 分数带有参考标识，不会自动换算为真实 IELTS Band。</p></section></div></div>`
  );
}
function render() {
  const p = page();
  document.title = `${pages[p]} · IELTS Tracker`;
  $("#page-name").textContent = pages[p];
  document
    .querySelectorAll("[data-page]")
    .forEach((a) =>
      a.setAttribute("aria-current", a.dataset.page === p ? "page" : "false"),
    );
  $("#error-count").textContent = state.errors.filter(
    (e) => e.status === "review",
  ).length;
  $("#storage-status").textContent = storageBlocked
    ? "存储异常 · 写入暂停"
    : "仅本机存储";
  $("#main").innerHTML = {
    dashboard,
    training,
    trends,
    errors: errorsPage,
    stages,
    data: dataPage,
  }[p]();
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function area(name, label, value = "", extra = "") {
  return `<label class="full">${label}<textarea name="${name}" maxlength="10000" ${extra}>${esc(value)}</textarea></label>`;
}
function select(name, label, entries, value) {
  return `<label>${label}<select name="${name}">${entries.map(([k, v]) => `<option value="${k}" ${String(value) === String(k) ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
}
const skillSelect = (value) =>
  select(
    "skill",
    "科目",
    SKILLS.map((k) => [k, LABELS[k]]),
    value,
  );
const minuteField = (name, label, v) =>
  field(
    name,
    label,
    v ?? "",
    "number",
    'min="0" max="1440" step="any" placeholder="未知请留空"',
  );
function editor(title, html, save) {
  $("#editor-title").textContent = title;
  $("#editor-fields").innerHTML = `<div class="form-grid">${html}</div>`;
  $("#form-error").textContent = "";
  editorSave = save;
  $("#editor").showModal();
}
function editTask(existing) {
  const t = existing ?? {
    date: selectedDate,
    skill: "listening",
    title: "",
    plannedMinutes: null,
    actualMinutes: null,
    completed: false,
    notes: "",
  };
  editor(
    existing ? "编辑学习任务" : "添加学习任务",
    field("date", "学习日期", t.date, "date", "required") +
      skillSelect(t.skill) +
      field(
        "title",
        "任务内容",
        t.title,
        "text",
        'required maxlength="10000"',
      ) +
      select(
        "completed",
        "完成状态",
        [
          ["false", "未完成"],
          ["true", "已完成"],
        ],
        String(t.completed),
      ) +
      minuteField("plannedMinutes", "计划分钟数", t.plannedMinutes) +
      minuteField("actualMinutes", "实际分钟数", t.actualMinutes) +
      area("notes", "备注", t.notes),
    (f) => {
      const row = validateTask({
        id: existing?.id ?? uid(),
        date: f.date,
        skill: f.skill,
        title: f.title,
        plannedMinutes: toNum(f.plannedMinutes),
        actualMinutes: toNum(f.actualMinutes),
        completed: f.completed === "true",
        notes: f.notes,
      });
      const next = clone(state);
      next.tasks = existing
        ? next.tasks.map((x) => (x.id === row.id ? row : x))
        : [...next.tasks, row];
      return persist(next);
    },
  );
}
const toNum = (v) => (v === "" || v == null ? null : Number(v));
const toBool = (v) => (v === "null" ? null : v === "true");
function editSession(existing, skill = "listening") {
  const s = existing ?? validateSession({ date: selectedDate, skill });
  let html =
    field("date", "练习日期", s.date, "date", "required") +
    skillSelect(s.skill) +
    field(
      "source",
      "来源 / 套题 / 可比练习系列",
      s.source,
      "text",
      'maxlength="10000" placeholder="未知可留空"',
    ) +
    field(
      "questionType",
      "题型",
      s.questionType,
      "text",
      'maxlength="10000" placeholder="例如：Part 1 / 选择题"',
    ) +
    field(
      "difficulty",
      "难度",
      s.difficulty,
      "text",
      'maxlength="10000" placeholder="未知可留空"',
    ) +
    select("scoreType", "成绩类型", Object.entries(SCORE_LABELS), s.scoreType) +
    select(
      "timed",
      "是否计时",
      [
        ["null", "未知"],
        ["true", "计时"],
        ["false", "不限时"],
      ],
      String(s.timed),
    ) +
    select(
      "firstAttempt",
      "是否首次作答",
      [
        ["null", "未知"],
        ["true", "首次作答"],
        ["false", "重复作答"],
      ],
      String(s.firstAttempt),
    ) +
    minuteField("minutes", "练习分钟数", s.minutes) +
    `<div data-session-kind="band">${field("band", "用户记录 Band（练习不可填）", s.band ?? "", "number", 'min="0" max="9" step="any" placeholder="未知请留空"')}</div>` +
    `<div data-session-kind="objective">${field("correct", "正确题数", s.correct ?? "", "number", 'min="0" max="1000" step="1"')}</div><div data-session-kind="objective">${field("total", "总题数", s.total ?? "", "number", 'min="1" max="1000" step="1"')}</div>` +
    `<div data-session-kind="speaking">${field("questions", "口语练习问题数", s.questions ?? "", "number", 'min="0" max="1000" step="1"')}</div><div data-session-kind="speaking">${field("topic", "口语话题", s.topic, "text", 'maxlength="10000"')}</div>` +
    `<div data-session-kind="writing" class="full form-grid">${select(
      "writingTask",
      "写作任务",
      [
        ["", "待补充"],
        ["task1", "Task 1"],
        ["task2", "Task 2"],
      ],
      s.writingTask ?? "",
    )}${["taskResponse", "coherence", "lexical", "grammar"].map((k, i) => field(k, ["任务回应", "连贯衔接", "词汇", "语法"][i] + "（0–9，未知留空）", s.dimensions?.[k] ?? "", "number", 'min="0" max="9" step="any"')).join("")}</div>` +
    area("feedback", "表达错误 / 练习反馈", s.feedback) +
    area("improvements", "改进建议", s.improvements) +
    `<p class="help full">单次练习不换算 IELTS Band。AI 判断请选择“AI 估计”。未知数据请留空；更改科目会清除不适用字段。</p>`;
  editor(existing ? "编辑训练记录" : "记录一次训练", html, (f) => {
    const objective = ["listening", "reading"].includes(f.skill),
      writing = f.skill === "writing",
      speaking = f.skill === "speaking";
    const dims = Object.fromEntries(
      ["taskResponse", "coherence", "lexical", "grammar"].map((k) => [
        k,
        toNum(f[k]),
      ]),
    );
    const row = validateSession({
      id: existing?.id ?? uid(),
      date: f.date,
      skill: f.skill,
      source: f.source,
      questionType: f.questionType,
      difficulty: f.difficulty,
      timed: toBool(f.timed),
      firstAttempt: toBool(f.firstAttempt),
      scoreType: f.scoreType,
      minutes: toNum(f.minutes),
      band: toNum(f.band),
      correct: objective ? toNum(f.correct) : null,
      total: objective ? toNum(f.total) : null,
      questions: speaking ? toNum(f.questions) : null,
      topic: speaking ? f.topic : "",
      feedback: f.feedback,
      writingTask: writing ? f.writingTask || null : null,
      dimensions:
        writing && Object.values(dims).some((x) => x !== null) ? dims : null,
      improvements: f.improvements,
    });
    const next = clone(state);
    next.sessions = existing
      ? next.sessions.map((x) => (x.id === row.id ? row : x))
      : [...next.sessions, row];
    return persist(next);
  });
  updateSessionFields();
}
function updateSessionFields() {
  const f = $("#editor-form"),
    skill = f.elements.skill?.value,
    score = f.elements.scoreType?.value;
  document.querySelectorAll("[data-session-kind]").forEach((el) => {
    const kind = el.dataset.sessionKind,
      visible =
        kind === "objective"
          ? ["listening", "reading"].includes(skill)
          : kind === "band"
            ? score !== "practice"
            : kind === skill;
    el.hidden = !visible;
    el.querySelectorAll("input,select,textarea").forEach((x) => {
      x.disabled = !visible;
    });
  });
}
function editError(existing) {
  const e = existing ?? {
    date: selectedDate,
    skill: "speaking",
    original: "",
    corrected: "",
    category: "grammar",
    explanation: "",
  };
  editor(
    existing ? "更正纠错条目" : "添加纠错",
    (existing
      ? ""
      : field("date", "出现日期", e.date, "date", "required") +
        skillSelect(e.skill)) +
      select("category", "错误分类", Object.entries(CATEGORIES), e.category) +
      area("original", "原句", e.original, "required") +
      area("corrected", "修改后句子", e.corrected, "required") +
      area("explanation", "解释", e.explanation),
    (f) => {
      const next = clone(state);
      if (existing) {
        const updated = {
          ...existing,
          original: f.original.trim(),
          corrected: f.corrected.trim(),
          category: f.category,
          explanation: f.explanation.trim(),
        };
        validateError({
          id: existing.id,
          date: existing.occurrences[0].date,
          skill: existing.occurrences[0].skill,
          original: updated.original,
          corrected: updated.corrected,
          category: updated.category,
          explanation: updated.explanation,
        });
        if (
          next.errors.some(
            (x) => x.id !== existing.id && errorKey(x) === errorKey(updated),
          )
        )
          throw new Error("相同纠错条目已存在，请在原条目中更正。");
        // Preserve occurrence keys as immutable import identities.
        next.errors = next.errors.map((x) =>
          x.id === existing.id ? updated : x,
        );
        return persist(next);
      }
      const report = parseReport({
        schemaVersion: 1,
        date: f.date,
        errors: [validateError({ ...f, id: uid() })],
      });
      return persist(importReport(next, report).state);
    },
  );
}
function editReview(existing) {
  const r = existing ?? { date: selectedDate, summary: "", adjustments: "" };
  editor(
    existing ? "编辑每周复盘" : "每周复盘",
    field("date", "复盘日期", r.date, "date", "required") +
      area("summary", "本周回顾", r.summary, "required") +
      area("adjustments", "下一步训练调整", r.adjustments),
    (f) => {
      date(f.date);
      const row = {
        id: existing?.id ?? uid(),
        date: f.date,
        summary: f.summary.trim(),
        adjustments: f.adjustments.trim(),
      };
      if (!row.summary) throw new Error("请填写本周回顾");
      const next = clone(state);
      next.reviews = existing
        ? next.reviews.map((x) => (x.id === row.id ? row : x))
        : [...next.reviews, row];
      return persist(next);
    },
  );
}
function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function downloadBackup() {
  download(
    `ielts-backup-${today()}.json`,
    JSON.stringify(backup(state), null, 2),
  );
}
function previewReport() {
  try {
    const raw = $("#report-json").value;
    if (raw.length > 2 * 1024 * 1024) throw new Error("报告过大，最大 2 MB");
    reportPreview = parseReport(raw);
    const result = importReport(state, reportPreview);
    $("#report-error").textContent = "";
    $("#report-preview").innerHTML =
      `<div class="preview"><strong>${result.duplicate ? "此报告已导入，无需重复添加" : "校验通过，请核对后确认"}</strong><p>报告日期 ${reportPreview.date} · 任务 ${reportPreview.tasks.length} · 训练 ${reportPreview.sessions.length} · 纠错事件 ${reportPreview.errors.length}</p><p>预计新增：任务 ${result.added.tasks} · 训练 ${result.added.sessions} · 纠错出现 ${result.added.errors}</p>${reportPreview.warnings.map((w) => `<p>${esc(w)}</p>`).join("")}<ul>${reportPreview.tasks
        .slice(0, 10)
        .map(
          (t) =>
            `<li>${t.date} · ${LABELS[t.skill]} · ${esc(t.title)} · 实际 ${numText(t.actualMinutes, " 分钟")}</li>`,
        )
        .join("")}${reportPreview.sessions
        .slice(0, 10)
        .map(
          (s) =>
            `<li>${s.date} · ${LABELS[s.skill]} · ${esc(s.source || "来源未知")} · ${SCORE_LABELS[s.scoreType]} · ${s.correct === null ? "成绩待测" : `${s.correct}/${s.total}`} · ${numText(s.minutes, " 分钟")}</li>`,
        )
        .join("")}${reportPreview.errors
        .slice(0, 10)
        .map((e) => `<li>${esc(e.original)} → ${esc(e.corrected)}</li>`)
        .join(
          "",
        )}</ul><details><summary>查看全部标准化数据（完整预览）</summary><pre>${esc(JSON.stringify({ tasks: reportPreview.tasks, sessions: reportPreview.sessions, errors: reportPreview.errors }, null, 2))}</pre></details><p class="help">需要更正时，请编辑上方 JSON 后重新校验。完成状态与时长不会互相推断。</p><div class="actions"><button class="primary" data-action="confirm-report" ${result.duplicate ? "disabled" : ""}>确认导入</button></div></div>`;
  } catch (e) {
    reportPreview = null;
    $("#report-preview").innerHTML = "";
    $("#report-error").textContent = `无法导入：${e.message}`;
  }
}
async function readFile(file, maxMB = 2) {
  if (!file) return null;
  if (file.size > maxMB * 1024 * 1024)
    throw new Error(`文件过大，最大 ${maxMB} MB`);
  return file.text();
}
$("#editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const f = Object.fromEntries(new FormData(event.target));
    if (editorSave(f)) {
      $("#editor").close();
      render();
    }
  } catch (e) {
    $("#form-error").textContent = e.message;
  }
});
$("#editor").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) $("#editor").close();
});
$("#editor-form").addEventListener("change", (e) => {
  if (["skill", "scoreType"].includes(e.target.name)) updateSessionFields();
});
$("#main").addEventListener("input", (e) => {
  if (e.target.id === "report-json") {
    reportPreview = null;
    $("#report-preview").innerHTML = "";
    $("#report-error").textContent = "";
  }
});
$("#main").addEventListener("change", async (e) => {
  const el = e.target;
  if (el.id === "selected-date") {
    try {
      selectedDate = date(el.value);
      render();
    } catch (err) {
      notify(err.message, true);
    }
    return;
  }
  if (el.dataset.taskToggle) {
    const next = clone(state),
      t = next.tasks.find((x) => x.id === el.dataset.taskToggle);
    if (t) t.completed = el.checked;
    persist(next);
    render();
    return;
  }
  if (el.id === "report-file") {
    try {
      const text = await readFile(el.files[0]);
      if (text !== null) {
        $("#report-json").value = text;
        previewReport();
      }
    } catch (err) {
      $("#report-error").textContent = err.message;
    }
  }
  if (el.id === "backup-file") {
    backupPreview = null;
    $("#backup-preview").innerHTML = "";
    $("#backup-error").textContent = "";
    try {
      const text = await readFile(el.files[0], 20);
      if (text === null) return;
      backupPreview = restore(text);
      $("#backup-preview").innerHTML =
        `<div class="preview"><strong>备份校验通过</strong><p>任务 ${backupPreview.tasks.length} · 训练 ${backupPreview.sessions.length} · 纠错 ${backupPreview.errors.length} · 复盘 ${backupPreview.reviews.length}</p><p>恢复会替换当前数据，确认后会先自动下载当前完整备份。不会合并。</p><label class="check"><input id="restore-consent" type="checkbox">我已检查文件，并同意替换当前数据</label><div class="actions"><button class="primary" data-action="restore">确认恢复备份</button></div></div>`;
    } catch (err) {
      $("#backup-error").textContent = err.message;
    }
  }
});
$("#main").addEventListener("submit", (e) => {
  if (!e.target.dataset.stage) return;
  e.preventDefault();
  try {
    const k = e.target.dataset.stage,
      f = Object.fromEntries(new FormData(e.target)),
      level = Number(f.level),
      current = state.stages[k].level;
    date(f.date);
    if (f.date > today()) throw new Error("阶段变更不能在未来日期");
    if (state.stages[k].changedOn && f.date < state.stages[k].changedOn)
      throw new Error("阶段变更日期不能早于上次变更");
    if (current === level)
      throw new Error("请选择不同的目标阶段；仅调整训练可写入每周复盘。");
    const evidence = stageEvidence(state, k, f.date);
    if (level > current && (level !== current + 1 || !evidence.ready))
      throw new Error(
        "升级需满足 14 天、多次可比记录与持续进步，且每次只能升一级。你仍可在复盘里随时调整训练。",
      );
    if (!f.reason.trim()) throw new Error("请填写调整原因");
    const next = clone(state),
      s = next.stages[k];
    s.history.push({
      date: f.date,
      from: current,
      to: level,
      reason: f.reason.trim(),
    });
    s.level = level;
    s.changedOn = f.date;
    if (persist(next, "阶段已由你手动确认。")) render();
  } catch (err) {
    notify(err.message, true);
  }
});
$("#main").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.filter) {
    skillFilter = button.dataset.filter;
    render();
    return;
  }
  if (button.dataset.period) {
    period = Number(button.dataset.period);
    render();
    return;
  }
  if (button.dataset.errorFilter) {
    errorFilter = button.dataset.errorFilter;
    render();
    return;
  }
  const action = button.dataset.action,
    id = button.dataset.id;
  try {
    if (action === "task") editTask();
    else if (action === "edit-task")
      editTask(state.tasks.find((x) => x.id === id));
    else if (action === "session")
      editSession(
        null,
        button.dataset.skill ??
          (skillFilter === "all" ? "listening" : skillFilter),
      );
    else if (action === "edit-session")
      editSession(state.sessions.find((x) => x.id === id));
    else if (action === "error") editError();
    else if (action === "edit-error")
      editError(state.errors.find((x) => x.id === id));
    else if (action === "review") editReview();
    else if (action === "edit-review")
      editReview(state.reviews.find((x) => x.id === id));
    else if (action === "delete-task" || action === "delete-session") {
      if (!confirm("确认删除这条记录？删除后可以通过完整备份恢复。")) return;
      const next = clone(state),
        type = action === "delete-task" ? "tasks" : "sessions";
      next[type] = next[type].filter((x) => x.id !== id);
      if (persist(next)) render();
    } else if (action === "toggle-error") {
      const next = clone(state),
        row = next.errors.find((x) => x.id === id);
      row.status = row.status === "review" ? "mastered" : "review";
      if (persist(next)) render();
    } else if (action === "template") {
      $("#report-json").value = reportTemplate();
      reportPreview = null;
      $("#report-preview").innerHTML = "";
    } else if (action === "preview-report") previewReport();
    else if (action === "confirm-report") {
      if (!reportPreview) throw new Error("请先校验并预览报告");
      const result = importReport(state, reportPreview);
      if (
        persist(
          result.state,
          result.duplicate
            ? "此报告已导入，未添加重复记录。"
            : `导入完成：新增 ${result.added.tasks} 项任务、${result.added.sessions} 条训练、${result.added.errors} 次纠错。`,
        )
      )
        render();
    } else if (action === "backup") downloadBackup();
    else if (action === "csv")
      download(
        `ielts-records-${today()}.csv`,
        csv(state),
        "text/csv;charset=utf-8",
      );
    else if (action === "raw-backup")
      download(
        `ielts-raw-storage-${today()}.txt`,
        localStorage.getItem("ielts-tracker:v1") ?? "空存储",
        "text/plain",
      );
    else if (action === "restore") {
      if (!backupPreview || !$("#restore-consent").checked)
        throw new Error("请先检查备份并勾选替换确认");
      if (storageBlocked)
        download(
          `ielts-raw-storage-${today()}.txt`,
          localStorage.getItem("ielts-tracker:v1") ?? "空存储",
          "text/plain",
        );
      else downloadBackup();
      // A validated backup is the only explicit recovery path when corrupt storage blocks normal writes.
      const wasBlocked = storageBlocked;
      storageBlocked = false;
      if (persist(backupPreview, "完整备份已恢复；原有数据备份已下载。"))
        render();
      else storageBlocked = wasBlocked;
    }
  } catch (err) {
    notify(err.message, true);
  }
});
window.addEventListener("hashchange", () => {
  render();
  $("#main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
window.addEventListener("storage", (event) => {
  if (event.key === "ielts-tracker:v1") {
    try {
      state = loadState(localStorage);
      storageBlocked = false;
      render();
      notify("已载入其他标签页的最新记录。");
    } catch {
      storageBlocked = true;
      notify("其他标签页写入了无法读取的数据，已暂停写入。", true);
    }
  }
});
function connectivity() {
  $("#offline-status").textContent = navigator.onLine ? "本地优先" : "离线可用";
}
window.addEventListener("online", connectivity);
window.addEventListener("offline", connectivity);
render();
connectivity();
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .catch(() =>
      notify(
        "离线缓存未启用；学习数据仍可本机保存。请使用 HTTPS 或 localhost。",
      ),
    );
