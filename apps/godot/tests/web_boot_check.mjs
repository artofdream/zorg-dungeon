#!/usr/bin/env node
// Headless browser boot check for the Godot web export (no deploy, no
// network beyond 127.0.0.1). Serves build/web without COOP/COEP headers,
// opens it in headless Chrome over the DevTools protocol and passes only if
// the engine starts single-threaded with crossOriginIsolated === false and
// no page exception. Needs Node 22+ (global WebSocket) and google-chrome.
//   node tests/web_boot_check.mjs build/web [shot.png]
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const dir = process.argv[2] ?? "build/web";
const shot = process.argv[3];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".pck": "application/octet-stream", ".png": "image/png" };
const server = createServer((req, res) => {
  const rel = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
  const file = join(dir, rel);
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const profile = mkdtempSync(join(tmpdir(), "zorg-chrome-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME ?? "google-chrome", [
  "--headless=new", "--no-sandbox", `--user-data-dir=${profile}`, "--disable-extensions", "--no-first-run",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720",
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code, msg) => { console.log(msg); chrome.kill(); server.close(); process.exit(code); };

let tabs;
for (let i = 0; i < 30 && !tabs; i++) {
  await sleep(500);
  tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => undefined);
}
if (!tabs) done(1, "web boot: FAIL (chrome did not start)");
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
  if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { id++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });

let booted = false;
for (let i = 0; i < 90 && !booted; i++) {
  await sleep(1000);
  booted = logs.some((l) => l.includes("Build configuration") && l.includes("single-threaded"));
}
await sleep(3000); // let the first frames draw
const page = JSON.parse((await send("Runtime.evaluate", { expression: "JSON.stringify({coi: self.crossOriginIsolated, canvas: !!document.querySelector('canvas')})" })).result.value);
if (shot) writeFileSync(shot, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
for (const l of logs.slice(0, 10)) console.log("console:", l);
for (const e of errors) console.log("exception:", e);
const ok = booted && page.canvas && page.coi === false && errors.length === 0;
done(ok ? 0 : 1, `web boot: ${ok ? "PASS" : "FAIL"} (engine started single-threaded: ${booted}, crossOriginIsolated: ${page.coi}, exceptions: ${errors.length})`);
