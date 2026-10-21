// ==UserScript==
// @name         Kipdayo
// @namespace    https://github.com/xn-sakina/kipdayo
// @version      1.1.2
// @description  Fetch Bilibili MP4 play URLs directly from the video page and copy them to the clipboard.
// @author       kipdayo
// @match        https://www.bilibili.com/video/BV*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      api.bilibili.com
// @connect      upos-sz-mirrorcoso1.bilivideo.com
// @connect      upos-sz-mirror08c.bilivideo.com
// @connect      upos-sz-mirroralio1.bilivideo.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const ENABLE_SESSDATA = false; // 手动改为 true 才会自动附带 SESSDATA
  const DEBUG_FORCE_ENGLISH = false; // 调试时改为 true 可预览英文 UI；默认自动检测，不提供语言切换入口
  const UI_LANGUAGE = detectUiLanguage();
  const MESSAGES = {
    zh: {
      parseAndCopy: "解析并复制",
      parsing: "解析中…",
      hideParser: "隐藏 Kipdayo 解析器",
      showParser: "显示 Kipdayo 解析器",
      allCdnsUnavailable: "所有 CDN 均不可用，请稍后重试",
      requestTimeout: "请求超时",
      networkError: "网络请求失败",
      httpError: "请求失败，状态码 {status}",
      invalidResponse: "响应解析失败",
      videoInfoError: "获取视频信息失败",
      playUrlError: "未找到可用的播放地址",
      apiError: "{message}（错误码 {code}）",
      missingBvid: "当前页面未找到 BV 号",
      clipboardError: "复制到剪贴板失败",
      parseSuccess: "解析成功，已复制直链到剪贴板 ✨",
      parseFailed: "解析失败：{reason}",
      unexpectedError: "发生未知错误，请稍后重试",
      parseError: "解析失败",
      readHiddenError: "无法读取隐藏状态",
      saveHiddenError: "无法持久化隐藏状态",
      abortProbeError: "取消 CDN 探测失败",
      clipboardFallback: "navigator.clipboard 失败，使用 GM_setClipboard",
      gmClipboardError: "GM_setClipboard 失败",
    },
    en: {
      parseAndCopy: "Parse & Copy",
      parsing: "Parsing…",
      hideParser: "Hide Kipdayo parser",
      showParser: "Show Kipdayo parser",
      allCdnsUnavailable: "All CDNs are unavailable. Please try again later.",
      requestTimeout: "Request timed out",
      networkError: "Network request failed",
      httpError: "Request failed with status {status}",
      invalidResponse: "Failed to parse the response",
      videoInfoError: "Failed to fetch video information",
      playUrlError: "No playable video URL found",
      apiError: "{message} (error code {code})",
      missingBvid: "No BV ID found on this page",
      clipboardError: "Failed to copy to the clipboard",
      parseSuccess: "Success! Direct URL copied to the clipboard ✨",
      parseFailed: "Parsing failed: {reason}",
      unexpectedError: "An unexpected error occurred. Please try again later.",
      parseError: "Parsing failed",
      readHiddenError: "Failed to read the hidden state",
      saveHiddenError: "Failed to save the hidden state",
      abortProbeError: "Failed to abort the CDN probe",
      clipboardFallback: "navigator.clipboard failed; falling back to GM_setClipboard",
      gmClipboardError: "GM_setClipboard failed",
    },
  };

  function detectUiLanguage() {
    if (DEBUG_FORCE_ENGLISH) return "en";
    try {
      // Only use the primary language; do not scan secondary preferences.
      const primaryLanguage = navigator.languages?.[0] || navigator.language ||
        Intl.DateTimeFormat().resolvedOptions().locale;
      const locale = new Intl.Locale(primaryLanguage.replace(/_/g, "-"));
      // Preserve explicit regions (e.g. zh-SG); infer one only when absent (zh / zh-Hant).
      const region = locale.region || locale.maximize().region;
      return ["CN", "TW", "HK"].includes(region) ? "zh" : "en";
    } catch {
      return "en";
    }
  }

  function t(key, values = {}) {
    return MESSAGES[UI_LANGUAGE][key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  }

  // Only localized, script-owned errors may be shown in the UI.
  class UserFacingError extends Error {}

  function apiError(key, json) {
    console.error("Bilibili API error", json.code, json.message);
    return new UserFacingError(Number.isFinite(json.code)
      ? t("apiError", { message: t(key), code: json.code })
      : t(key));
  }
  const REQUEST_TIMEOUT = 15000;
  const CDN_PROBE_TIMEOUT = 5000;
  const CDN_LAYER1_TIMEOUT_STEP = 2000;
  const CDN_LAYERS = [
    [
      "upos-sz-mirrorcoso1.bilivideo.com",
      "upos-sz-mirror08c.bilivideo.com",
      "upos-sz-mirroralio1.bilivideo.com",
    ],
    [
      "upos-sz-mirrorhwb.bilivideo.com",
      "upos-sz-mirrorcosb.bilivideo.com",
      "upos-sz-mirrorbd.bilivideo.com",
      "upos-sz-mirrorali.bilivideo.com",
      "upos-sz-mirroralib.bilivideo.com",
    ],
  ];
  let isParsing = false;
  const CONTAINER_ID = "tm-kipdayo-container";
  const BUTTON_ID = "tm-kipdayo-button";
  const HIDE_TOGGLE_ID = "tm-kipdayo-hide";
  const HANDLE_ID = "tm-kipdayo-handle";
  const STORAGE_KEY_HIDDEN = "kipdayo-ui-hidden";
  const MESSAGE_ID = "tm-kipdayo-message";

  GM_addStyle(`
    #${CONTAINER_ID} {
      position: fixed;
      bottom: 84px;
      right: 28px;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      transition: right 0.45s cubic-bezier(0.4, 0.0, 0.2, 1);
    }
    #${CONTAINER_ID}::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(129, 140, 248, 0.16));
      filter: blur(18px);
      opacity: 0.85;
      pointer-events: none;
      transform: scale(1.05);
      z-index: -1;
    }
    #${CONTAINER_ID}.collapsed {
      right: -14px;
    }
    #${BUTTON_ID} {
      position: relative;
      padding: 12px 18px;
      background: linear-gradient(135deg, rgba(0, 183, 255, 0.9), rgba(91, 33, 182, 0.9));
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      box-shadow: 0 10px 28px rgba(0, 170, 255, 0.28);
      backdrop-filter: blur(6px);
      transition: transform 0.25s ease, box-shadow 0.3s ease, opacity 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0.92;
    }
    #${BUTTON_ID}:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 16px 32px rgba(0, 170, 255, 0.38);
      opacity: 1;
    }
    #${BUTTON_ID}.loading {
      pointer-events: none;
      opacity: 0.7;
    }
    #${BUTTON_ID} .tm-label {
      letter-spacing: 0.02em;
    }
    #${BUTTON_ID} .tm-spinner {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      animation: tm-spin 0.75s linear infinite;
    }
    @keyframes tm-spin {
      to {
        transform: rotate(360deg);
      }
    }
    #${HIDE_TOGGLE_ID} {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: none;
      background: rgba(15, 23, 42, 0.72);
      color: rgba(224, 231, 255, 0.9);
      backdrop-filter: blur(6px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 22px rgba(15, 23, 42, 0.35);
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    #${CONTAINER_ID}:hover #${HIDE_TOGGLE_ID} {
      opacity: 1;
      transform: scale(1);
    }
    #${CONTAINER_ID}.collapsed #${HIDE_TOGGLE_ID} {
      display: none;
    }
    #${CONTAINER_ID}.collapsed::after {
      display: none;
    }
    #${CONTAINER_ID}.collapsed #${HANDLE_ID} {
      box-shadow: none;
    }
    #${HIDE_TOGGLE_ID}:hover {
      background: rgba(30, 41, 59, 0.88);
    }
    #${HANDLE_ID} {
      position: absolute;
      top: 50%;
      right: -52px;
      transform: translateY(-50%) translateX(80%);
      padding: 10px 14px;
      background: rgba(15, 23, 42, 0.86);
      color: #e2e8f0;
      border-radius: 14px 0 0 14px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 14px 32px rgba(15, 23, 42, 0.45);
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0;
      pointer-events: none;
      transition: transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s ease;
    }
    #${HANDLE_ID}::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.8);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.7);
    }
    #${CONTAINER_ID}.collapsed #${HANDLE_ID} {
      transform: translateY(-50%) translateX(0);
      opacity: 1;
      pointer-events: auto;
      color: transparent;
    }
    #${CONTAINER_ID}.collapsed #${BUTTON_ID} {
      opacity: 0;
      pointer-events: none;
      transform: translateX(120%);
    }
    #${CONTAINER_ID} #${BUTTON_ID} {
      transition: transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s ease;
    }
    #${MESSAGE_ID} {
      position: fixed;
      bottom: 40px;
      right: 36px;
      max-width: 260px;
      padding: 12px 16px;
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.88);
      color: #e2e8f0;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.38);
      backdrop-filter: blur(8px);
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: none;
    }
    #${MESSAGE_ID}.visible {
      opacity: 1;
      transform: translateY(0);
    }
    #${MESSAGE_ID} .tm-status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.7);
    }
    #${MESSAGE_ID}.error .tm-status-dot {
      background: #f87171;
      box-shadow: 0 0 12px rgba(248, 113, 113, 0.7);
    }
    #${MESSAGE_ID}.success .tm-status-dot {
      background: #4ade80;
      box-shadow: 0 0 12px rgba(74, 222, 128, 0.7);
    }
  `);

  function ensureUI() {
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      container.setAttribute("aria-live", "polite");
      container.lang = UI_LANGUAGE === "zh" ? "zh-CN" : "en";

      const button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.innerHTML = `<span class="tm-label">${t("parseAndCopy")}</span>`;
      button.addEventListener("click", handleButtonClick, { passive: true });

      const hideButton = document.createElement("button");
      hideButton.id = HIDE_TOGGLE_ID;
      hideButton.type = "button";
      hideButton.setAttribute("aria-label", t("hideParser"));
      hideButton.innerHTML = "<span>✕</span>";
      hideButton.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          setHiddenState(true);
        },
        { passive: true }
      );

      const handle = document.createElement("div");
      handle.id = HANDLE_ID;
      handle.textContent = "Kipdayo";
      handle.title = t("showParser");
      handle.setAttribute("aria-label", t("showParser"));
      handle.addEventListener(
        "click",
        () => {
          setHiddenState(false);
        },
        { passive: true }
      );

      container.appendChild(button);
      container.appendChild(hideButton);
      container.appendChild(handle);
      document.body.appendChild(container);
    }

    applyHiddenState(container);
    if (!document.getElementById(MESSAGE_ID)) {
      const message = document.createElement("div");
      message.id = MESSAGE_ID;
      message.lang = UI_LANGUAGE === "zh" ? "zh-CN" : "en";
      message.innerHTML = `<span class="tm-status-dot"></span><span class="tm-text"></span>`;
      document.body.appendChild(message);
    }
  }

  function getStoredHidden() {
    try {
      return window.localStorage.getItem(STORAGE_KEY_HIDDEN) === "1";
    } catch (err) {
      console.warn(t("readHiddenError"), err);
      return false;
    }
  }

  function applyHiddenState(container) {
    const hidden = getStoredHidden();
    container.classList.toggle("collapsed", hidden);
  }

  function setHiddenState(hidden) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    container.classList.toggle("collapsed", hidden);
    try {
      if (hidden) {
        window.localStorage.setItem(STORAGE_KEY_HIDDEN, "1");
      } else {
        window.localStorage.removeItem(STORAGE_KEY_HIDDEN);
      }
    } catch (err) {
      console.warn(t("saveHiddenError"), err);
    }
  }

  function showMessage(type, text) {
    const el = document.getElementById(MESSAGE_ID);
    if (!el) return;
    el.classList.remove("error", "success");
    if (type) {
      el.classList.add(type);
    }
    const textSpan = el.querySelector(".tm-text");
    if (textSpan) {
      textSpan.textContent = text;
    }
    el.classList.add("visible");
    clearTimeout(showMessage._timer);
    showMessage._timer = window.setTimeout(() => {
      el.classList.remove("visible");
    }, 4000);
  }

  function setButtonLoading(loading) {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    if (loading) {
      button.classList.add("loading");
      button.dataset.originalContent = button.innerHTML;
      button.innerHTML = `<span class="tm-spinner"></span><span>${t("parsing")}</span>`;
    } else {
      button.classList.remove("loading");
      if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
      }
    }
  }

  function getSessdataIfEnabled() {
    if (!ENABLE_SESSDATA) {
      return "";
    }
    const match = document.cookie.match(/(?:^|;\s*)SESSDATA=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function extractBvid() {
    const pathMatch = window.location.pathname.match(/BV[\w]+/);
    if (pathMatch) {
      return pathMatch[0];
    }
    if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.bvid) {
      return window.__INITIAL_STATE__.bvid;
    }
    return null;
  }

  function replaceCdnHost(url, hostname) {
    const parsed = new URL(url);
    parsed.protocol = "https:";
    parsed.hostname = hostname;
    parsed.port = "";
    return parsed.href;
  }

  function isSuccessfulResponse(response) {
    return response.status >= 200 && response.status < 300;
  }

  function probeVideoUrl(url, timeout = CDN_PROBE_TIMEOUT) {
    let request;
    let settled = false;
    let resolveResult;
    let timer;
    const promise = new Promise((resolve) => {
      resolveResult = resolve;
    });
    const finish = (available, abortRequest = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (abortRequest && request) {
        try {
          request.abort();
        } catch (err) {
          console.warn(t("abortProbeError"), err);
        }
      }
      resolveResult(available);
    };
    const abort = () => finish(false, true);

    // Reachability is enough; stop at response headers without downloading the body.
    timer = window.setTimeout(abort, timeout);
    try {
      request = GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: { Range: "bytes=0-0" },
        responseType: "arraybuffer",
        fetch: false,
        timeout,
        onreadystatechange: (response) => {
          if (response.readyState === 2) {
            finish(isSuccessfulResponse(response), true);
          }
        },
        onprogress: (response) => {
          if (response.status > 0) finish(isSuccessfulResponse(response), true);
        },
        onload: (response) => finish(isSuccessfulResponse(response)),
        onerror: () => finish(false),
        ontimeout: abort,
        onabort: () => finish(false),
      });
      // Also handle a synchronous callback before GM returns the request handle.
      if (settled) request.abort();
    } catch {
      finish(false);
    }
    return { promise, abort };
  }

  function raceAvailableUrls(urls) {
    return new Promise((resolve, reject) => {
      if (!urls.length) {
        reject(new UserFacingError(t("allCdnsUnavailable")));
        return;
      }
      const probes = urls.map((url) => probeVideoUrl(url));
      let remaining = probes.length;
      let settled = false;
      probes.forEach((probe, index) => {
        probe.promise.then((available) => {
          if (settled) return;
          if (available) {
            settled = true;
            // Cancel in this callback, before entering the clipboard/success flow.
            probes.forEach((other) => other.abort());
            resolve(urls[index]);
          } else if (--remaining === 0) {
            settled = true;
            reject(new UserFacingError(t("allCdnsUnavailable")));
          }
        });
      });
    });
  }

  async function findAvailableVideoUrl(url) {
    const layers = CDN_LAYERS.map((hosts) =>
      hosts.map((hostname) => replaceCdnHost(url, hostname))
    );
    for (const [index, candidate] of layers[0].entries()) {
      const timeout = CDN_PROBE_TIMEOUT + index * CDN_LAYER1_TIMEOUT_STEP;
      if (await probeVideoUrl(candidate, timeout).promise) return candidate;
    }
    return raceAvailableUrls(layers[1]);
  }

  function requestJson(url, referer) {
    return new Promise((resolve, reject) => {
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: referer,
        Origin: "https://www.bilibili.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        DNT: "1",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
      };
      const sessdata = getSessdataIfEnabled();
      if (sessdata) {
        headers["Cookie"] = `SESSDATA=${sessdata}`;
      }

      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers,
        timeout: REQUEST_TIMEOUT,
        ontimeout: () => reject(new UserFacingError(t("requestTimeout"))),
        onerror: () => reject(new UserFacingError(t("networkError"))),
        onload: (response) => {
          try {
            if (response.status !== 200) {
              reject(new UserFacingError(t("httpError", { status: response.status })));
              return;
            }
            const json = JSON.parse(response.responseText);
            resolve(json);
          } catch (err) {
            reject(new UserFacingError(t("invalidResponse")));
          }
        },
      });
    });
  }

  async function fetchVideoInfo(bvid) {
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
    const referer = `https://www.bilibili.com/video/${bvid}`;
    const json = await requestJson(url, referer);
    if (json.code !== 0 || !json.data) {
      throw apiError("videoInfoError", json);
    }
    return {
      cid: json.data.cid,
      aid: json.data.aid,
    };
  }

  async function fetchPlayUrl(bvid, cid) {
    const query = new URLSearchParams({
      bvid,
      cid: String(cid),
      qn: "80",
      fnval: "1",
      fnver: "0",
      fourk: "1",
      platform: "html5",
      high_quality: "1",
    });
    const url = `https://api.bilibili.com/x/player/playurl?${query.toString()}`;
    const referer = `https://www.bilibili.com/video/${bvid}`;
    const json = await requestJson(url, referer);
    if (json.code !== 0 || !json.data || !json.data.durl || !json.data.durl.length) {
      throw apiError("playUrlError", json);
    }
    const directUrl = await findAvailableVideoUrl(json.data.durl[0].url);
    return { url: directUrl, format: "MP4" };
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn(t("clipboardFallback"), err);
      try {
        GM_setClipboard(text, "text");
        return true;
      } catch (err2) {
        console.error(t("gmClipboardError"), err2);
        return false;
      }
    }
  }

  async function handleButtonClick() {
    if (isParsing) return;
    isParsing = true;
    setButtonLoading(true);
    try {
      const bvid = extractBvid();
      if (!bvid) {
        throw new UserFacingError(t("missingBvid"));
      }
      const info = await fetchVideoInfo(bvid);
      const result = await fetchPlayUrl(bvid, info.cid);
      const copied = await copyToClipboard(result.url);
      if (!copied) {
        throw new UserFacingError(t("clipboardError"));
      }
      showMessage("success", t("parseSuccess"));
    } catch (err) {
      console.error(t("parseError"), err);
      showMessage("error", t("parseFailed", {
        reason: err instanceof UserFacingError ? err.message : t("unexpectedError"),
      }));
    } finally {
      isParsing = false;
      setButtonLoading(false);
    }
  }

  function observeRouteChanges() {
    let lastPath = location.pathname;
    const check = () => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        ensureUI();
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  function bootstrap() {
    ensureUI();
    observeRouteChanges();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    bootstrap();
  } else {
    window.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  }
})();