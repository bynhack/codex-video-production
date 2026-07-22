import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StageViews } from "./stage-views.mjs";

const previewDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../preview");
const assets = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/app.js", ["app.js", "text/javascript; charset=utf-8"]], ["/markdown.js", ["markdown.js", "text/javascript; charset=utf-8"]], ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]]);
const mediaTypes = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".gif", "image/gif"], [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"]]);

class HttpError extends Error { constructor(status, message, headers = {}) { super(message); this.status = status; this.headers = headers; } }
function json(response, status, value) { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(value)); }

function events(store, response, sessionId) {
  const record = store.record(sessionId);
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
  const send = (event, value) => response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  send("ready", { stateRevision: record.state.stateRevision });
  const unsubscribe = store.subscribe(record, (value) => send("changed", value));
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
  response.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
}

async function body(request) {
  let source = "";
  for await (const chunk of request) { source += chunk; if (source.length > 256_000) throw new HttpError(413, "Request body is too large"); }
  return JSON.parse(source || "{}");
}

function byteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, "Invalid byte range", { "content-range": `bytes */${size}` });
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) throw new HttpError(416, "Invalid byte range", { "content-range": `bytes */${size}` });
  return { start, end: Math.min(end, size - 1) };
}

async function serveFile(store, request, response, sessionId, relativePath) {
  const record = store.record(sessionId);
  if (!record.allowedPaths?.has(relativePath)) throw new HttpError(403, "File is not exposed by a visible Stage view");
  const root = await realpath(record.outputDir);
  const target = await realpath(path.resolve(root, relativePath)).catch((error) => { if (error.code === "ENOENT") throw new HttpError(404, "File not found"); throw error; });
  if (!target.startsWith(`${root}${path.sep}`)) throw new HttpError(403, "File escapes the Production directory");
  const info = await stat(target);
  const type = mediaTypes.get(path.extname(target).toLowerCase());
  if (!info.isFile() || !type) throw new HttpError(415, "Unsupported media file");
  const range = type.startsWith("video/") ? byteRange(request.headers.range, info.size) : null;
  const headers = { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "content-disposition": "inline", "accept-ranges": "bytes" };
  if (range) {
    response.writeHead(206, { ...headers, "content-range": `bytes ${range.start}-${range.end}/${info.size}`, "content-length": range.end - range.start + 1 });
    return createReadStream(target, range).pipe(response);
  }
  response.writeHead(200, { ...headers, "content-length": info.size });
  createReadStream(target).pipe(response);
}

export async function startPreviewHttpServer(store, preferredPort = 5630) {
  const views = new StageViews(store);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true });
      const eventStream = url.pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
      if (request.method === "GET" && eventStream) return events(store, response, decodeURIComponent(eventStream[1]));
      const view = url.pathname.match(/^\/api\/sessions\/([^/]+)\/views\/([^/]+)$/);
      if (request.method === "GET" && view) return json(response, 200, await views.resolve(store.record(decodeURIComponent(view[1])), decodeURIComponent(view[2])));
      const session = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === "GET" && session) return json(response, 200, await store.get(store.record(decodeURIComponent(session[1])), { kind: "summary" }));
      const file = url.pathname.match(/^\/api\/sessions\/([^/]+)\/files$/);
      if (request.method === "GET" && file) return serveFile(store, request, response, decodeURIComponent(file[1]), url.searchParams.get("path") || "");
      const respond = url.pathname.match(/^\/api\/sessions\/([^/]+)\/interactions\/([^/]+)\/respond$/);
      if (request.method === "POST" && respond) return json(response, 200, { interaction: await store.respond(store.record(decodeURIComponent(respond[1])), decodeURIComponent(respond[2]), await body(request)) });
      const asset = assets.get(url.pathname);
      if (request.method === "GET" && asset) { response.writeHead(200, { "content-type": asset[1], "cache-control": "no-store" }); return response.end(await readFile(path.join(previewDir, asset[0]))); }
      throw new HttpError(404, "Not found");
    } catch (error) {
      const status = error.status || 400;
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(error.headers || {}) });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  const port = await listen(server, preferredPort);
  return { server, port, baseUrl: `http://127.0.0.1:${port}` };
}

function listen(server, preferredPort) {
  return new Promise((resolve, reject) => {
    let port = preferredPort;
    const attempt = () => {
      server.once("error", function failed(error) { if (error.code === "EADDRINUSE" && port < preferredPort + 99) { port += 1; attempt(); } else reject(error); });
      server.once("listening", () => resolve(port));
      server.listen(port, "127.0.0.1");
    };
    attempt();
  });
}
