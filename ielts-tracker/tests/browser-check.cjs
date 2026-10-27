// Optional QA: run from repository root with Playwright installed in your test environment.
// Uses disposable browser contexts and synthetic records only. No production data.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../..");
let server;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
};
async function serve() {
  execFileSync(process.execPath, ["ielts-tracker/tools/build-pages.mjs"], {
    cwd: ROOT,
  });
  const root = path.join(ROOT, "work/pages");
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/ai-development/")) {
        res.writeHead(404).end();
        return;
      }
      let rel = decodeURIComponent(
        url.pathname.slice("/ai-development/".length),
      );
      if (rel.endsWith("/") || !rel) rel += "index.html";
      const full = path.resolve(root, rel);
      if (!full.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await fs.readFile(full);
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(full)] || "application/octet-stream",
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}/ai-development/`;
}
const storage = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("ielts-tracker:v1")).data,
  );
const fill = async (p, name, value) =>
  p.locator(`#editor [name="${name}"]`).fill(String(value));
const choose = async (p, name, value) =>
  p.locator(`#editor [name="${name}"]`).selectOption(value);
const save = async (p) => {
  await p
    .locator("#editor")
    .getByRole("button", { name: "保存记录", exact: true })
    .click();
  await p.locator("#editor").waitFor({ state: "hidden" });
};
async function layout(p, label) {
  const dims = await p.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dims.scroll <= dims.width + 1,
    `${label}: horizontal overflow ${JSON.stringify(dims)}`,
  );
}
async function run() {
  const base = process.env.TRACKER_BASE_URL || (await serve());
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [],
    failed = [],
    external = [];
  await fs.mkdir(path.join(ROOT, "work/qa"), { recursive: true });
  try {
    for (const [label, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 375, height: 812 }],
    ]) {
      const context = await browser.newContext({
        viewport,
        acceptDownloads: true,
        isMobile: label === "mobile",
        hasTouch: label === "mobile",
      });
      const p = await context.newPage();
      p.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
      p.on("response", (r) => {
        if (r.status() >= 400 && !r.url().endsWith("favicon.ico"))
          failed.push(`${r.status()} ${r.url()}`);
      });
      p.on("request", (r) => {
        if (new URL(r.url()).origin !== new URL(base).origin)
          external.push(r.url());
      });
      await p.goto(base);
      await p.waitForURL(/ielts-tracker\//);
      await p.locator("h1").waitFor();
      const current = await p.locator("#selected-date").inputValue();
      assert.ok((await p.locator("#main").innerText()).includes("待测"));
      await layout(p, `${label} dashboard`);
      await p.screenshot({
        path: path.join(ROOT, `work/qa/${label}-dashboard.png`),
        fullPage: true,
      });
      for (const name of [
        "training",
        "trends",
        "errors",
        "stages",
        "data",
        "dashboard",
      ]) {
        await p.locator(`nav [data-page="${name}"]`).click();
        await p.locator("h1").waitFor();
        await layout(p, `${label} ${name}`);
      }
      // Historical check-in with unknown actual minutes, completion toggle, edit and persistence.
      await p
        .getByRole("button", { name: "＋ 添加任务", exact: true })
        .first()
        .click();
      await fill(p, "title", "SYNTHETIC task");
      await fill(p, "plannedMinutes", 25);
      await save(p);
      assert.equal((await storage(p)).tasks[0].actualMinutes, null);
      await p.locator("[data-task-toggle]").check();
      assert.equal((await storage(p)).tasks[0].completed, true);
      assert.equal((await storage(p)).tasks[0].actualMinutes, null);
      await p.locator('[data-action="edit-task"]').click();
      await fill(p, "actualMinutes", 18);
      await fill(p, "date", "2000-01-01");
      await save(p);
      await p.locator("#selected-date").fill("2000-01-01");
      assert.equal(await p.locator("[data-task-toggle]").count(), 1);
      await p.reload();
      await p.locator("h1").waitFor();
      assert.equal((await storage(p)).tasks[0].actualMinutes, 18);
      assert.equal((await storage(p)).tasks[0].date, "2000-01-01");
      // Four-skill recording form, changing visible fields without inventing values.
      await p.locator('nav [data-page="training"]').click();
      await p.getByRole("button", { name: "＋ 记录训练", exact: true }).click();
      await fill(p, "source", "SYNTHETIC series");
      await fill(p, "questionType", "choice");
      await fill(p, "difficulty", "A");
      await choose(p, "timed", "true");
      await choose(p, "firstAttempt", "true");
      await fill(p, "correct", 3);
      await fill(p, "total", 8);
      await save(p);
      await p.getByRole("button", { name: "＋ 记录训练", exact: true }).click();
      await choose(p, "skill", "speaking");
      await fill(p, "questions", 2);
      await fill(p, "topic", "SYNTHETIC topic");
      await save(p);
      await p.getByRole("button", { name: "＋ 记录训练", exact: true }).click();
      await choose(p, "skill", "writing");
      await choose(p, "writingTask", "task2");
      await choose(p, "scoreType", "ai_estimate");
      await fill(p, "grammar", 5);
      await fill(p, "improvements", "SYNTHETIC advice");
      await save(p);
      assert.equal((await storage(p)).sessions.length, 3);
      await layout(p, `${label} populated training`);
      // Report preview is not a write. Invalid input reports errors. Duplicate report adds nothing.
      await p.locator('nav [data-page="data"]').click();
      await p.locator("#report-json").fill('{"schemaVersion":99}');
      await p.getByRole("button", { name: "校验并预览" }).click();
      assert.ok(await p.locator("#report-error").innerText());
      const report = {
        schemaVersion: 1,
        reportId: "synthetic-ui-report",
        date: current,
        sessions: [
          {
            skill: "reading",
            source: "SYNTHETIC series",
            questionType: "choice",
            difficulty: "A",
            timed: true,
            firstAttempt: true,
            correct: 4,
            total: 10,
            minutes: null,
          },
        ],
        errors: [
          {
            skill: "speaking",
            original: "SYNTHETIC wrong sentence.",
            corrected: "SYNTHETIC corrected sentence.",
            category: "grammar",
            explanation: "SYNTHETIC feedback.",
          },
        ],
      };
      await p.locator("#report-json").fill(JSON.stringify(report));
      await p.getByRole("button", { name: "校验并预览" }).click();
      assert.equal((await storage(p)).sessions.length, 3);
      await p.getByRole("button", { name: "确认导入", exact: true }).click();
      assert.equal((await storage(p)).sessions.length, 4);
      await p.locator("#report-json").fill(JSON.stringify(report));
      await p.getByRole("button", { name: "校验并预览" }).click();
      assert.ok(
        await p
          .getByRole("button", { name: "确认导入", exact: true })
          .isDisabled(),
      );
      assert.equal((await storage(p)).sessions.length, 4);
      // Error correction editing and reversible mastery.
      await p.locator('nav [data-page="errors"]').click();
      await p.getByRole("button", { name: "更正", exact: true }).click();
      await fill(p, "explanation", "SYNTHETIC corrected explanation.");
      await save(p);
      await p.getByRole("button", { name: "标记掌握" }).click();
      await p.locator('[data-error-filter="mastered"]').click();
      await p.getByRole("button", { name: "恢复待复习" }).click();
      assert.equal((await storage(p)).errors[0].status, "review");
      // Trends, period changes and populated mobile screens.
      await p.locator('nav [data-page="trends"]').click();
      for (const n of [7, 30, 90]) {
        await p.locator(`[data-period="${n}"]`).click();
        await layout(p, `${label} ${n} days`);
      }
      await p.screenshot({
        path: path.join(ROOT, `work/qa/${label}-trends.png`),
        fullPage: true,
      });
      await p.locator('nav [data-page="stages"]').click();
      await p.getByRole("button", { name: "＋ 写复盘" }).click();
      await fill(p, "summary", "SYNTHETIC weekly review.");
      await fill(p, "adjustments", "SYNTHETIC next steps.");
      await save(p);
      assert.equal((await storage(p)).reviews.length, 1);
      // Backup download, empty data replacement and full restoration.
      const before = await storage(p);
      await p.locator('nav [data-page="data"]').click();
      const download = await Promise.all([
        p.waitForEvent("download"),
        p
          .getByRole("button", { name: "下载完整 JSON 备份", exact: true })
          .click(),
      ]);
      const content = await fs.readFile(await download[0].path(), "utf8");
      assert.deepEqual(JSON.parse(content).data, before);
      await p.locator('nav [data-page="training"]').click();
      p.once("dialog", (dialog) => dialog.accept());
      await p.locator('[data-action="delete-session"]').first().click();
      assert.equal(
        (await storage(p)).sessions.length,
        before.sessions.length - 1,
      );
      await p.locator('nav [data-page="data"]').click();
      await p
        .locator("#backup-file")
        .setInputFiles({
          name: "synthetic-backup.json",
          mimeType: "application/json",
          buffer: Buffer.from(content),
        });
      await p.locator("#restore-consent").check();
      await p.getByRole("button", { name: "确认恢复备份" }).click();
      assert.deepEqual(await storage(p), before);
      await p.reload();
      await p.locator("h1").waitFor();
      assert.deepEqual(await storage(p), before);
      await p.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true);
      await p.reload();
      await p.locator("h1").waitFor();
      assert.deepEqual(await storage(p), before);
      await context.setOffline(false);
      console.log(
        `${label}: six pages, forms, nulls, persistence, import/dedup, error review, trends, backup/restore and offline PASS`,
      );
      await context.close();
    }
    assert.deepEqual(errors, [], "browser JS errors");
    assert.deepEqual(failed, [], "failed application assets");
    assert.deepEqual(external, [], "unexpected external requests");
    console.log(
      "Pages /ai-development/ redirect and relative assets PASS; no external data requests.",
    );
  } finally {
    await browser.close();
  }
}
run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => server?.close());
