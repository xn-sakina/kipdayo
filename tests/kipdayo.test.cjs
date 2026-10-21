const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../tampermonkey/kipdayo.user.js"), "utf8");
const VIDEO = "BV1xx411c7mD";
const videoInfo = {
  code: 0,
  data: { aid: 1, cid: 111, pages: [{ page: 1, cid: 111 }, { page: 2, cid: 222 }] },
};
const playInfo = (name = "video") => ({
  code: 0,
  data: { durl: [{ url: "https://original.bilivideo.com/" + name + ".mp4" }] },
});
const flush = () => new Promise(setImmediate);

function harness({ session = false } = {}) {
  const requests = [];
  const clipboard = [];
  const timers = new Map();
  const frames = [];
  let timerId = 0;
  const classes = () => {
    const values = new Set();
    return {
      add: (...names) => names.forEach(name => values.add(name)),
      remove: (...names) => names.forEach(name => values.delete(name)),
      toggle(name, force) { force ? values.add(name) : values.delete(name); },
      contains: name => values.has(name),
    };
  };
  const button = { classList: classes(), dataset: {}, innerHTML: "Parse & Copy" };
  const messageText = { textContent: "" };
  const elements = {
    "tm-kipdayo-container": { classList: classes() },
    "tm-kipdayo-button": button,
    "tm-kipdayo-message": { classList: classes(), querySelector: () => messageText },
  };
  const location = { pathname: "/video/" + VIDEO, search: "" };
  const schedule = (callback, delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  };
  const context = {
    URL, URLSearchParams, Intl, AbortController,
    console: { log() {}, warn() {}, error() {} },
    location,
    clearTimeout: id => timers.delete(id),
    navigator: { languages: ["en-US"], clipboard: { writeText: async text => { clipboard.push(text); } } },
    document: { readyState: "loading", cookie: "", getElementById: id => elements[id] || null },
    GM_addStyle() {},
    GM_setClipboard: text => clipboard.push(text),
    GM_xmlhttpRequest(options) {
      const request = {
        options, abortCount: 0,
        abort() {
          this.abortCount++;
          options.onabort?.();
        },
      };
      requests.push(request);
      return request;
    },
    requestAnimationFrame: callback => frames.push(callback),
  };
  context.window = {
    location, setTimeout: schedule, addEventListener() {},
    localStorage: { getItem: () => null },
  };
  vm.createContext(context);
  const exports = "globalThis.api = { CDN_LAYERS, fetchVideoInfo, fetchPlayUrl, requestJson, probeVideoUrl, raceAvailableUrls, findAvailableVideoUrl, copyToClipboard, handleButtonClick, observeRouteChanges };";
  const script = source.replace("const ENABLE_SESSDATA = false;", "const ENABLE_SESSDATA = " + session + ";")
    .replace(/\}\)\(\);\s*$/, exports + "})();");
  vm.runInContext(script, context);
  return {
    api: context.api, context, requests, clipboard, timers, location, button, messageText,
    frame() {
      assert.ok(frames.length, "route observer scheduled");
      frames.shift()();
    },
    timeout(delay) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, "timeout scheduled: " + delay);
      timers.delete(entry[0]);
      entry[1].callback();
    },
  };
}

function json(request, data, status = 200) {
  request.options.onload({ status, responseText: JSON.stringify(data) });
}
function media(request, type = "video/mp4", status = 206, event = "headers") {
  const response = { status, readyState: 2, responseHeaders: "Content-Type: " + type + "\r\n" };
  if (event === "headers") request.options.onreadystatechange(response);
  else request.options.onload(response);
}

test("all configured CDN hosts have explicit connection permissions", () => {
  const h = harness();
  const allowed = new Set([...source.matchAll(/^\/\/ @connect\s+(\S+)/gm)].map(match => match[1]));
  for (const host of h.api.CDN_LAYERS.flat()) assert.ok(allowed.has(host), host);
});

test("selects the requested page CID and defaults to page 1", async () => {
  const h = harness();
  const second = h.api.fetchVideoInfo(VIDEO, 2);
  json(h.requests[0], videoInfo);
  assert.equal((await second).cid, 222);
  const first = h.api.fetchVideoInfo(VIDEO);
  json(h.requests[1], videoInfo);
  assert.equal((await first).cid, 111);
});

test("rejects missing and invalid pages without falling back to page 1", async () => {
  const h = harness();
  const missing = h.api.fetchVideoInfo(VIDEO, 3);
  json(h.requests[0], videoInfo);
  await assert.rejects(missing, /video information/);
  for (const page of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(h.api.fetchVideoInfo(VIDEO, page), /video information/);
  }
  assert.equal(h.requests.length, 1);
});

test("API requests are anonymous when the session switch is off", async () => {
  const h = harness();
  h.context.document.cookie = "SESSDATA=example";
  const operation = h.api.requestJson("https://api.bilibili.com/test", "https://www.bilibili.com/");
  assert.equal(h.requests[0].options.anonymous, true);
  assert.equal(h.requests[0].options.headers.Cookie, undefined);
  json(h.requests[0], { code: 0 });
  await operation;
  assert.equal(h.timers.size, 0);
});

test("enabling the session allows browser cookies; CDN probes stay anonymous", async () => {
  const h = harness({ session: true });
  const operation = h.api.requestJson("https://api.bilibili.com/test", "https://www.bilibili.com/");
  assert.equal(h.requests[0].options.anonymous, false);
  json(h.requests[0], { code: 0 });
  await operation;
  const probe = h.api.probeVideoUrl("https://example.com/video.mp4");
  assert.equal(h.requests[1].options.anonymous, true);
  media(h.requests[1]);
  assert.equal(await probe.promise, true);
});

test("API timeout independently aborts a stalled fetch-mode request", async () => {
  const h = harness();
  const operation = h.api.requestJson("https://api.bilibili.com/test", "");
  h.timeout(15000);
  await assert.rejects(operation, /timed out/);
  assert.equal(h.requests[0].abortCount, 1);
  assert.equal(h.timers.size, 0);
});

test("API abort settles once and ignores late success", async () => {
  const h = harness();
  const controller = new AbortController();
  const operation = h.api.requestJson("https://api.bilibili.com/test", "", controller.signal);
  controller.abort();
  json(h.requests[0], { code: 0 });
  await assert.rejects(operation, error => error.constructor.name === "ParseCancelledError");
  assert.equal(h.requests[0].abortCount, 1);
  assert.equal(h.timers.size, 0);
});

test("pre-cancelled operations do not start API or CDN requests", async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.api.requestJson("https://api.bilibili.com/test", "", controller.signal));
  assert.equal(await h.api.probeVideoUrl("https://example.com/video.mp4", 5000, controller.signal).promise, false);
  await assert.rejects(h.api.findAvailableVideoUrl("https://example.com/video.mp4", controller.signal));
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers.size, 0);
});

test("CDN checks accept media and binary data but reject HTML, JSON and invalid statuses", async () => {
  for (const [type, status, expected] of [
    ["video/mp4", 206, true],
    ["VIDEO/MP4; charset=binary", 200, true],
    ["application/octet-stream", 206, true],
    ["binary/octet-stream", 200, true],
    ["application/mp4", 200, true],
    ["text/html", 200, false],
    ["application/json", 200, false],
    ["", 200, false],
    ["video/mp4", 204, false],
    ["video/mp4", 403, false],
  ]) {
    const h = harness();
    const probe = h.api.probeVideoUrl("https://example.com/video.mp4");
    media(h.requests[0], type, status);
    assert.equal(await probe.promise, expected, type + " " + status);
    assert.equal(h.requests[0].abortCount, 1);
    assert.equal(h.timers.size, 0);
  }
});

test("fetch-mode probes validate onload when early headers are unavailable", async () => {
  const h = harness();
  const probe = h.api.probeVideoUrl("https://example.com/video.mp4");
  h.requests[0].options.onreadystatechange({ readyState: 2, status: 0 });
  h.requests[0].options.onprogress({ status: 206 });
  media(h.requests[0], "video/mp4", 206, "load");
  assert.equal(await probe.promise, true);
});

test("probe timeout aborts stalled requests", async () => {
  const h = harness();
  const probe = h.api.probeVideoUrl("https://example.com/video.mp4");
  h.timeout(5000);
  assert.equal(await probe.promise, false);
  assert.equal(h.requests[0].abortCount, 1);
});

test("an HTML error response falls back to the next CDN", async () => {
  const h = harness();
  const operation = h.api.findAvailableVideoUrl("https://original.bilivideo.com/video.mp4");
  media(h.requests[0], "text/html", 200);
  await flush();
  assert.equal(h.requests.length, 2);
  media(h.requests[1]);
  assert.equal(new URL(await operation).hostname, h.api.CDN_LAYERS[0][1]);
});

test("second-layer racing cancels the losing requests", async () => {
  const h = harness();
  const operation = h.api.findAvailableVideoUrl("https://original.bilivideo.com/video.mp4");
  for (let index = 0; index < 3; index++) {
    h.requests[index].options.onerror();
    await flush();
  }
  assert.equal(h.requests.length, 8);
  media(h.requests[5]);
  assert.equal(new URL(await operation).hostname, h.api.CDN_LAYERS[1][2]);
  for (const request of h.requests.slice(3)) assert.equal(request.abortCount, 1);
  assert.equal(h.timers.size, 0);
});

test("cancelling a second-layer race aborts every request", async () => {
  const h = harness();
  const controller = new AbortController();
  const operation = h.api.raceAvailableUrls(["https://a/video", "https://b/video"], controller.signal);
  controller.abort();
  await assert.rejects(operation, error => error.constructor.name === "ParseCancelledError");
  for (const request of h.requests) assert.equal(request.abortCount, 1);
  assert.equal(h.timers.size, 0);
});

test("Parse & Copy uses the current p parameter end to end", async () => {
  const h = harness();
  h.location.search = "?p=2";
  const operation = h.api.handleButtonClick();
  json(h.requests[0], videoInfo);
  await flush();
  assert.equal(new URL(h.requests[1].options.url).searchParams.get("cid"), "222");
  json(h.requests[1], playInfo("part2"));
  await flush();
  media(h.requests[2]);
  await operation;
  assert.equal(h.clipboard.length, 1);
  assert.ok(h.clipboard[0].endsWith("/part2.mp4"));
  assert.equal(h.button.classList.contains("loading"), false);
});

for (const change of ["BV", "page"]) {
  test("changing " + change + " cancels a pending API request without copying", async () => {
    const h = harness();
    h.api.observeRouteChanges();
    const operation = h.api.handleButtonClick();
    if (change === "BV") h.location.pathname = "/video/BV1yy411c7mD";
    else h.location.search = "?p=2";
    h.frame();
    json(h.requests[0], videoInfo);
    await operation;
    assert.equal(h.requests[0].abortCount, 1);
    assert.equal(h.clipboard.length, 0);
    assert.equal(h.requests.length, 1);
    assert.equal(h.button.classList.contains("loading"), false);
    assert.equal(h.messageText.textContent, "");
  });
}

test("late results are ignored even before the route observer runs", async () => {
  const h = harness();
  const operation = h.api.handleButtonClick();
  h.location.search = "?p=2";
  json(h.requests[0], videoInfo);
  await operation;
  assert.equal(h.requests.length, 1);
  assert.equal(h.clipboard.length, 0);
});

test("an old task cannot reset a new task's loading state after navigation", async () => {
  const h = harness();
  h.api.observeRouteChanges();
  const oldOperation = h.api.handleButtonClick();
  json(h.requests[0], videoInfo);
  await flush();
  json(h.requests[1], playInfo("old"));
  await flush();
  h.location.search = "?p=2";
  h.frame();
  const newOperation = h.api.handleButtonClick();
  await oldOperation;
  assert.equal(h.requests[2].abortCount, 1);
  assert.equal(h.button.classList.contains("loading"), true);
  json(h.requests[3], videoInfo);
  await flush();
  json(h.requests[4], playInfo("new"));
  await flush();
  media(h.requests[5]);
  await newOperation;
  assert.equal(h.clipboard.length, 1);
  assert.ok(h.clipboard[0].endsWith("/new.mp4"));
  assert.equal(h.button.classList.contains("loading"), false);
});

test("clipboard fallback is skipped when a task becomes stale", async () => {
  const h = harness();
  let rejectWrite;
  let current = true;
  h.context.navigator.clipboard.writeText = () => new Promise((resolve, reject) => { rejectWrite = reject; });
  const operation = h.api.copyToClipboard("old-video", () => current);
  current = false;
  rejectWrite(new Error("denied"));
  assert.equal(await operation, false);
  assert.equal(h.clipboard.length, 0);
});

test("clipboard fallback still works for the current task", async () => {
  const h = harness();
  h.context.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  assert.equal(await h.api.copyToClipboard("current-video"), true);
  assert.deepEqual(h.clipboard, ["current-video"]);
});
