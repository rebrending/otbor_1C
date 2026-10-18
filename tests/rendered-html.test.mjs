import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the promise diary", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Дневник обещаний<\/title>/i);
  assert.match(html, /Новое дело/);
  assert.match(html, /День/);
  assert.match(html, /Неделя/);
  assert.match(html, /Месяц/);
});

test("keeps records isolated and drafts recoverable", async () => {
  const storage = await readFile(new URL("../app/storage.ts", import.meta.url), "utf8");
  assert.match(storage, /createObjectStore\(STORE_NAME, \{ keyPath: "id" \}\)/);
  assert.match(storage, /request\.result\.filter\(isMatter\)/);
  assert.match(storage, /localStorage\.setItem/);
});
