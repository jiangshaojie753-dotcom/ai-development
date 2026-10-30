// Deterministic browser integration tests: all remote responses are synthetic and intercepted.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../..");
let server;
async function serve() {
  execFileSync(process.execPath, ["ielts-tracker/tools/build-pages.mjs"], {
    cwd: ROOT,
  });
  const root = path.join(ROOT, "work/pages");
  server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      if (!u.pathname.startsWith("/ai-development/"))
        return res.writeHead(404).end();
      let rel = decodeURIComponent(u.pathname.slice("/ai-development/".length));
      if (!rel || rel.endsWith("/")) rel += "index.html";
      const full = path.resolve(root, rel);
      if (!full.startsWith(root + path.sep)) return res.writeHead(403).end();
      const type =
        {
          ".js": "text/javascript",
          ".html": "text/html",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[path.extname(full)] || "text/plain";
      res
        .writeHead(200, { "Content-Type": type + "; charset=utf-8" })
        .end(await fs.readFile(full));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}/ai-development/`;
}
const value = (p, name) => p.locator(`#editor [name="${name}"]`);
const fill = (p, name, text) => value(p, name).fill(text);
const lookup = (p) => p.locator('[data-dictionary-action="lookup"]').click();
const apply = (p, i = 0) => p.locator(`[data-dictionary-apply="${i}"]`).click();
const waitIdle = (p) =>
  p.waitForFunction(
    () =>
      document
        .querySelector("#v-dictionary-results")
        ?.getAttribute("aria-busy") === "false",
  );
const data = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("ielts-tracker:v1"))?.data);
const open = async (p) => {
  await p.locator('[data-v-action="add"]').click();
};
const close = (p) => p.locator("#editor [data-close]").first().click();
const save = async (p) => {
  await p.locator('#editor button[type="submit"]').click();
  await p.locator("#editor").waitFor({ state: "hidden" });
};
const layout = async (p) =>
  assert.ok(
    await p.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        [...document.querySelectorAll("#editor input,#editor textarea")].every(
          (x) => x.getBoundingClientRect().right <= innerWidth + 1,
        ),
    ),
  );
const definition = (word) => [
  {
    word,
    license: {
      name: "CC BY-SA 3.0",
      url: "https://creativecommons.org/licenses/by-sa/3.0",
    },
    sourceUrls: [`https://en.wiktionary.org/wiki/${word}`],
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          {
            definition: `Synthetic ${word} noun meaning.`,
            example: "Synthetic example only.",
          },
        ],
      },
      {
        partOfSpeech: "verb",
        definitions: [{ definition: `Synthetic ${word} verb meaning.` }],
      },
    ],
  },
];
async function run() {
  const base = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1440, 375]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        isMobile: width === 375,
        hasTouch: width === 375,
        acceptDownloads: true,
      });
      const page = await context.newPage(),
        requests = [],
        errors = [];
      let acceptConfirm = true,
        gates = [],
        deferred = false,
        offline = false;
      const waitGates = async (n) => {
        const end = Date.now() + 5000;
        while (gates.length < n && Date.now() < end)
          await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(
          gates.length >= n,
          `Expected ${n} pending synthetic requests`,
        );
      };
      page.on("dialog", (d) => (acceptConfirm ? d.accept() : d.dismiss()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) =>
          window.cspViolations.push(e.blockedURI),
        );
      });
      await context.route(
        /^https:\/\/(api\.dictionaryapi\.dev|api\.mymemory\.translated\.net)\//,
        async (route) => {
          const u = new URL(route.request().url()),
            english = u.hostname === "api.dictionaryapi.dev";
          const q = english
            ? decodeURIComponent(u.pathname.split("/").at(-1))
            : u.searchParams.get("q");
          requests.push({
            host: u.hostname,
            q,
            method: route.request().method(),
            headers: route.request().headers(),
          });
          if (offline) return route.abort("internetdisconnected");
          if (
            q === "slow" ||
            (deferred && q === "Synthetic race noun meaning.")
          )
            await new Promise((resolve) => gates.push(resolve));
          let status = 200,
            body;
          if (q === "missing" && english) {
            status = 404;
            body = { title: "No Definitions Found" };
          } else if (q === "broken") {
            status = 503;
            body = {};
          } else if (!english && (q === "quota" || q.includes("quota noun")))
            body = { responseStatus: 429, quotaFinished: true };
          else if (english) body = definition(q);
          else
            body = {
              responseStatus: 200,
              responseData: {
                translatedText: q.includes("verb")
                  ? "缝合（虚构测试）"
                  : q.startsWith("Synthetic")
                    ? "测试释义（对应选中词义）"
                    : "单词中文参考（虚构测试）",
              },
            };
          try {
            await route.fulfill({
              status,
              contentType: "application/json",
              headers: { "access-control-allow-origin": "*" },
              body: JSON.stringify(body),
            });
          } catch {
            /* Cancelled queries may have already closed. */
          }
        },
      );
      await page.goto(base);
      await page.waitForURL(/ielts-tracker\//);
      await page.locator('nav [data-page="vocabulary"]').click();
      await open(page);
      await fill(page, "english", "stitch");
      assert.equal(requests.length, 0);
      await fill(page, "meaning", "我的原始中文");
      await lookup(page);
      await waitIdle(page);
      assert.equal(requests.length, 2);
      assert.equal(await value(page, "meaning").inputValue(), "我的原始中文");
      assert.equal(await page.locator("[data-dictionary-apply]").count(), 2);
      await layout(page);
      await fs.mkdir(path.join(ROOT, "work/qa"), { recursive: true });
      await page.screenshot({
        path: path.join(ROOT, `work/qa/dictionary-online-${width}.png`),
      });
      acceptConfirm = false;
      await apply(page, 1);
      await waitIdle(page);
      assert.equal(await value(page, "meaning").inputValue(), "我的原始中文");
      acceptConfirm = true;
      await apply(page, 1);
      await waitIdle(page);
      assert.equal(
        await value(page, "meaning").inputValue(),
        "缝合（虚构测试）",
      );
      assert.equal(
        await value(page, "englishDefinition").inputValue(),
        "Synthetic stitch verb meaning.",
      );
      assert.equal(await value(page, "pos").inputValue(), "verb");
      assert.match(
        await value(page, "definitionSource").inputValue(),
        /Free Dictionary API.*CC BY-SA/,
      );
      assert.doesNotMatch(
        await value(page, "definitionSource").inputValue(),
        /Collins/,
      );
      await save(page);
      const card = (await data(page)).vocabulary.cards[0];
      assert.match(card.meaningSource, /MyMemory/);
      await page.reload();
      await page.locator('nav [data-page="vocabulary"]').click();
      assert.equal(
        (await data(page)).vocabulary.cards[0].englishDefinition,
        card.englishDefinition,
      );

      // Stale responses after changing the query must not populate the new word.
      await open(page);
      await fill(page, "english", "slow");
      await lookup(page);
      await page.waitForFunction(
        () =>
          document
            .querySelector("#v-dictionary-results")
            ?.getAttribute("aria-busy") === "true",
      );
      await waitGates(2);
      await fill(page, "english", "other");
      gates.splice(0).forEach((resolve) => resolve());
      await lookup(page);
      await waitIdle(page);
      assert.match(
        await page.locator("#v-dictionary-results").innerText(),
        /Synthetic other/,
      );
      assert.doesNotMatch(
        await page.locator("#v-dictionary-results").innerText(),
        /Synthetic slow/,
      );
      assert.equal(await value(page, "meaning").inputValue(), "");
      await close(page);

      // A pending sense translation must not overwrite manual edits.
      await open(page);
      await fill(page, "english", "race");
      await lookup(page);
      await waitIdle(page);
      deferred = true;
      await apply(page);
      await waitGates(1);
      await fill(page, "meaning", "保留手动更正");
      gates.splice(0).forEach((resolve) => resolve());
      await waitIdle(page);
      assert.equal(await value(page, "meaning").inputValue(), "保留手动更正");
      assert.equal(await value(page, "englishDefinition").inputValue(), "");
      assert.match(
        await page.locator("#v-dictionary-status").innerText(),
        /未覆盖/,
      );
      deferred = false;
      await close(page);

      // Closing a pending lookup must not affect a subsequently opened editor.
      await open(page);
      await fill(page, "english", "slow");
      await lookup(page);
      await waitGates(2);
      await close(page);
      await open(page);
      await fill(page, "english", "fresh");
      gates.splice(0).forEach((resolve) => resolve());
      await fill(page, "meaning", "新表单内容");
      assert.equal(await value(page, "englishDefinition").inputValue(), "");
      await close(page);

      // A translation outage still leaves English definitions usable and editable.
      await open(page);
      await fill(page, "english", "quota");
      await lookup(page);
      await waitIdle(page);
      assert.match(
        await page.locator("#v-dictionary-status").innerText(),
        /额度/,
      );
      await apply(page);
      await waitIdle(page);
      assert.equal(
        await value(page, "englishDefinition").inputValue(),
        "Synthetic quota noun meaning.",
      );
      assert.equal(await value(page, "meaning").inputValue(), "");
      await fill(page, "meaning", "人工补充释义");
      await save(page);

      // Missing English entry offers Chinese-only assistance, never invented English.
      await open(page);
      await fill(page, "english", "missing");
      await fill(page, "englishDefinition", "My existing personal note.");
      await lookup(page);
      await waitIdle(page);
      await apply(page);
      assert.equal(
        await value(page, "englishDefinition").inputValue(),
        "My existing personal note.",
      );
      assert.match(await value(page, "meaning").inputValue(), /单词中文参考/);
      await close(page);

      await open(page);
      await fill(page, "english", "broken");
      await lookup(page);
      await waitIdle(page);
      assert.match(
        await page.locator("#v-dictionary-status").innerText(),
        /无法连接/,
      );
      await fill(page, "meaning", "无网络仍可手动填写");
      await save(page);

      // Automatic requests are opt-in, debounced, and reset on a new page session.
      await open(page);
      await fill(page, "english", "first");
      const before = requests.length;
      await page.locator("#v-dictionary-auto").check();
      await fill(page, "english", "second");
      await fill(page, "english", "final");
      await page.waitForFunction(() =>
        document
          .querySelector("#v-dictionary-status")
          ?.textContent.includes("请按当前语境"),
      );
      assert.deepEqual(
        requests.slice(before).map((r) => r.q),
        ["final", "final"],
      );
      await page.locator("#v-dictionary-auto").uncheck();
      await close(page);
      const snapshot = JSON.stringify(await data(page));
      await page.reload();
      await page.locator('nav [data-page="vocabulary"]').click();
      assert.equal(JSON.stringify(await data(page)), snapshot);
      await open(page);
      await fill(page, "english", "stitch");
      assert.equal(await page.locator("#v-dictionary-auto").isChecked(), false);
      await close(page);

      // No record payload, materials, notes, cookies or referer is sent to a provider.
      for (const r of requests) {
        assert.equal(r.method, "GET");
        assert.equal(r.headers.cookie, undefined);
        assert.equal(r.headers.referer, undefined);
        assert.doesNotMatch(
          r.q,
          /我的原始中文|保留手动更正|My existing personal note/,
        );
      }
      assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      offline = true;
      await context.setOffline(true);
      await page.reload();
      await page.locator('nav [data-page="vocabulary"]').click();
      assert.equal(
        (await data(page)).vocabulary.cards[0].englishDefinition,
        card.englishDefinition,
      );
      await open(page);
      await fill(page, "english", "offline");
      await lookup(page);
      await waitIdle(page);
      assert.match(
        await page.locator("#v-dictionary-status").innerText(),
        /无法连接/,
      );
      await fill(page, "meaning", "离线手动记录");
      await save(page);
      assert.equal((await data(page)).vocabulary.cards.length, 4);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `${width}px dictionary: explicit/automatic lookup, sense selection, attribution, no overwrites, cancellation, failures, persistence and offline PASS (mock providers)`,
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
