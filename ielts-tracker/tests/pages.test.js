import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../", import.meta.url));
const out = fileURLToPath(new URL("../../work/pages/", import.meta.url));
test("Pages builds only allowlisted app files, drops stale artifacts and preserves relative subpath entry", async () => {
  await mkdir(out, { recursive: true });
  await writeFile(
    `${out}/synthetic-private-sentinel.json`,
    "synthetic sentinel; never publish",
  );
  execFileSync(process.execPath, ["tools/build-pages.mjs"], { cwd: app });
  assert.deepEqual((await readdir(out)).sort(), [
    ".nojekyll",
    "ielts-tracker",
    "index.html",
  ]);
  const files = await readdir(`${out}/ielts-tracker`);
  assert.ok(
    !files.includes("tests") &&
      !files.includes("supabase") &&
      !files.includes("node_modules"),
  );
  assert.match(
    await readFile(`${out}/index.html`, "utf8"),
    /url=\.\/ielts-tracker\//,
  );
  const html = await readFile(`${out}/ielts-tracker/index.html`, "utf8");
  assert.match(html, /href="\.\/styles.css"/);
  assert.match(html, /src="\.\/app.js"/);
});
