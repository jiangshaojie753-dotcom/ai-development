// Explicit allowlist: never copy backups, local configuration, tests or repository contents.
import { mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const app = fileURLToPath(new URL("../", import.meta.url));
const out = path.resolve(app, "../work/pages");
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "ielts-tracker"), { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "core.js",
  "sync.js",
  "sw.js",
  "icon.svg",
  "README.md",
  "REPORT_FORMAT.md",
  "report.schema.json",
]) {
  await copyFile(path.join(app, file), path.join(out, "ielts-tracker", file));
}
await writeFile(path.join(out, ".nojekyll"), "");
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./ielts-tracker/"><title>IELTS Tracker</title></head><body><p><a href="./ielts-tracker/">进入 IELTS Tracker 雅思学习工作台</a></p></body></html>\n`,
);
console.log(`Pages artifact: ${out}`);
