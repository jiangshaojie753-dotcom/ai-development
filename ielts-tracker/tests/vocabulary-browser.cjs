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
  const base = await serve(),
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
  try {
    for (const width of [1440, 375]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        acceptDownloads: true,
        isMobile: width === 375,
        hasTouch: width === 375,
      });
      const p = await context.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("dialog", (d) => d.accept());
      const external = [];
      p.on("request", (r) => {
        if (
          /^https?:/.test(r.url()) &&
          new URL(r.url()).origin !== new URL(base).origin
        )
          external.push(r.url());
      });
      await p.goto(base);
      await p.waitForURL(/ielts-tracker\//);
      await p.locator("h1").waitFor();
      // Start with an actual V1 payload containing synthetic pre-existing task data.
      await p.evaluate(async () => {
        const core = await import("./core.js"),
          s = core.emptyState();
        delete s.vocabulary;
        s.schemaVersion = 1;
        s.tasks.push(
          core.validateTask({
            id: "old-task",
            date: "2000-01-01",
            skill: "reading",
            title: "SYNTHETIC old task",
          }),
        );
        localStorage.setItem(
          core.STORAGE_KEY,
          JSON.stringify({ ...core.backup(s), backupVersion: 1 }),
        );
      });
      await p.reload();
      await p.locator('nav [data-page="vocabulary"]').click();
      await p.locator('[data-v-action="add"]').click();
      await fill(p, "english", "sample");
      await fill(p, "meaning", "样本");
      await fill(p, "pos", "noun");
      await save(p);
      assert.equal((await storage(p)).tasks[0].title, "SYNTHETIC old task");
      assert.equal((await storage(p)).vocabulary.cards.length, 1);
      assert.ok(
        await p.evaluate(() => localStorage.getItem("ielts-tracker:pre-v2")),
      );
      await p.locator('[data-v-action="add"]').click();
      await choose(p, "category", "sentence");
      await fill(p, "english", "A sample is provided.");
      await fill(p, "meaning", "提供了一个样本。");
      await fill(p, "keyPoints", "is provided = 被提供");
      await choose(p, "reason", "listening");
      await save(p);
      await p.locator('[data-v-action="extract"]').click();
      await fill(p, "english", "is provided");
      await fill(p, "meaning", "被提供");
      await save(p);
      const v = (await storage(p)).vocabulary;
      assert.equal(v.cards.length, 3);
      assert.equal(v.cards[2].occurrences[0].parentId, v.cards[1].id);
      await p.locator("#v-search").fill("sample");
      assert.equal(await p.locator(".vocab-card").count(), 3);
      await p.locator("#v-search").fill("");
      await p.locator('[name="v-category"]').selectOption("sentence");
      assert.equal(await p.locator(".vocab-card").count(), 1);
      await p.locator('[name="v-category"]').selectOption("all");
      await layout(p, `${width} cards`);
      await fs.mkdir(path.join(ROOT, "work/qa"), { recursive: true });
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.screenshot({
        path: path.join(ROOT, `work/qa/vocabulary-${width}.png`),
        fullPage: true,
      });
      // Two senses and repeated row; every row must be explicitly confirmed before commit.
      await p.locator('[data-tab="import"]').click();
      const batch = {
        vocabularyVersion: 1,
        entries: [
          {
            category: "word",
            english: "bank",
            meaning: "银行",
            pos: "noun",
            sourceSkill: "reading",
          },
          {
            category: "word",
            english: "bank",
            meaning: "河岸",
            pos: "noun",
            sourceSkill: "reading",
          },
          {
            category: "word",
            english: "bank",
            meaning: "银行",
            pos: "noun",
            sourceSkill: "reading",
          },
        ],
      };
      await p.locator("#v-raw").fill(JSON.stringify(batch));
      await p.locator('[data-v-action="parse"]').click();
      assert.ok(await p.locator('[data-v-action="import"]').isDisabled());
      await p.locator('[data-v-action="draft-edit"]').first().click();
      await fill(p, "explanation", "SYNTHETIC explanation");
      await save(p);
      for (let i = 0; i < 3; i++)
        await p
          .locator(`[data-v-action="draft-confirm"][data-index="${i}"]`)
          .click();
      assert.equal((await storage(p)).vocabulary.cards.length, 3);
      await p.locator('[data-v-action="import"]').click();
      assert.equal((await storage(p)).vocabulary.cards.length, 5);
      // Repeating the same report doesn't create new cards; cancellation writes nothing.
      await p.locator("#v-raw").fill(JSON.stringify(batch));
      await p.locator('[data-v-action="parse"]').click();
      for (let i = 0; i < 3; i++)
        await p
          .locator(`[data-v-action="draft-confirm"][data-index="${i}"]`)
          .click();
      await p.locator('[data-v-action="import"]').click();
      assert.equal((await storage(p)).vocabulary.cards.length, 5);
      await p.locator("#v-raw").fill("生词\tcancelled\t取消的");
      await p.locator('[data-v-action="parse"]').click();
      await p.locator('[data-v-action="draft-remove"]').click();
      assert.equal(await p.locator('[data-v-action="import"]').count(), 0);
      await p.locator('[data-v-action="cancel-import"]').click();
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=",
        "base64",
      );
      await p
        .locator("#v-photo")
        .setInputFiles({
          name: "synthetic.png",
          mimeType: "image/png",
          buffer: png,
        });
      await p.locator("#v-photo-preview img").waitFor();
      assert.ok(
        await p
          .getByRole("button", { name: "直接识别：OCR 服务未配置" })
          .isDisabled(),
      );
      await p.locator('[data-v-action="clear-photo"]').click();
      await layout(p, `${width} import`);
      // Exercise all three modes and ensure one real persisted event per card/date.
      await p.locator('[data-tab="review"]').click();
      await p.locator('[name="v-mode"]').selectOption("phrase");
      await p.locator('[data-v-action="start-review"]').click();
      await p.locator('[data-v-action="reveal"]').click();
      await p.locator('[data-grade="vague"]').click();
      await p.locator('[name="v-mode"]').selectOption("zh");
      await p.locator('[data-v-action="start-review"]').click();
      await p.locator('[data-v-action="reveal"]').click();
      await p.locator('[data-grade="known"]').click();
      await p.locator('[name="v-mode"]').selectOption("en");
      await p.locator('[data-v-action="start-review"]').click();
      await p.locator('[data-v-action="reveal"]').click();
      await p.locator('[data-grade="unknown"]').click();
      assert.equal((await storage(p)).vocabulary.reviews.length, 3);
      await p.locator('[data-tab="stats"]').click();
      await p.locator('[data-days="30"]').click();
      await layout(p, `${width} stats`);
      await p.locator('[data-tab="data"]').click();
      const [d] = await Promise.all([
        p.waitForEvent("download"),
        p.locator('[data-v-action="export-json"]').click(),
      ]);
      const payload = await fs.readFile(await d.path());
      await p.locator('[data-tab="library"]').click();
      await p.locator('[data-v-action="delete"]').first().click();
      assert.equal(
        (await storage(p)).vocabulary.cards.filter((c) => !c.archived).length,
        4,
      );
      await p.locator('[data-tab="data"]').click();
      await p
        .locator("#v-restore")
        .setInputFiles({
          name: "synthetic.json",
          mimeType: "application/json",
          buffer: payload,
        });
      await p.locator('[data-v-action="restore"]').click();
      assert.equal(
        (await storage(p)).vocabulary.cards.filter((c) => !c.archived).length,
        5,
      );
      assert.equal((await storage(p)).tasks.length, 1);
      await p.reload();
      await p.locator("h1").waitFor();
      assert.equal((await storage(p)).vocabulary.reviews.length, 3);
      await p.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true);
      await p.reload();
      await p.locator("h1").waitFor();
      assert.equal((await storage(p)).vocabulary.cards.length, 5);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      await context.close();
      console.log(
        `${width}px V2 migration, CRUD, extraction, import/cancel/dedup, photo, all review modes, backup, persistence, offline PASS`,
      );
    }
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
