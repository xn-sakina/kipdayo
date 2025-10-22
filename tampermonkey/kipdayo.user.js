// ==UserScript==
// @name         Kipdayo
// @namespace    https://github.com/xn-sakina/kipdayo
// @version      1.0.0
// @description  Fetch Bilibili MP4 play URLs directly from the video page and copy them to the clipboard.
// @author       kipdayo
// @match        https://www.bilibili.com/video/BV*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      api.bilibili.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const ENABLE_SESSDATA = false; // 手动改为 true 才会自动附带 SESSDATA
  const REQUEST_TIMEOUT = 15000;
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

      const button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.innerHTML = `<span class="tm-label">解析并复制</span>`;
      button.addEventListener("click", handleButtonClick, { passive: true });

      const hideButton = document.createElement("button");
      hideButton.id = HIDE_TOGGLE_ID;
      hideButton.type = "button";
      hideButton.setAttribute("aria-label", "Hide Kipdayo parser");
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
      message.innerHTML = `<span class="tm-status-dot"></span><span class="tm-text"></span>`;
      document.body.appendChild(message);
    }
  }

  function getStoredHidden() {
    try {
      return window.localStorage.getItem(STORAGE_KEY_HIDDEN) === "1";
    } catch (err) {
      console.warn("无法读取隐藏状态", err);
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
      console.warn("无法持久化隐藏状态", err);
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
      button.innerHTML = `<span class="tm-spinner"></span><span>解析中…</span>`;
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

  function replaceToPublicCdn(url) {
    if (!url) return url;
    if (url.includes("upos-sz-mirror08c.bilivideo.com")) {
      return url;
    }
    if (url.includes("akamaized.net") || !url.includes("mirror08c")) {
      try {
        const parsed = new URL(url);
        return url.replace(parsed.hostname, "upos-sz-mirror08c.bilivideo.com");
      } catch (err) {
        console.warn("无法替换 CDN 主机", err);
      }
    }
    return url;
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
        ontimeout: () => reject(new Error("请求超时")),
        onerror: () => reject(new Error("网络请求失败")),
        onload: (response) => {
          try {
            if (response.status !== 200) {
              reject(new Error(`请求失败，状态码 ${response.status}`));
              return;
            }
            const json = JSON.parse(response.responseText);
            resolve(json);
          } catch (err) {
            reject(new Error("响应解析失败"));
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
      throw new Error(json.message || "获取视频信息失败");
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
      throw new Error(json.message || "未找到可用的播放地址");
    }
    const directUrl = replaceToPublicCdn(json.data.durl[0].url);
    return { url: directUrl, format: "MP4" };
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard 失败，使用 GM_setClipboard", err);
      try {
        GM_setClipboard(text, "text");
        return true;
      } catch (err2) {
        console.error("GM_setClipboard 失败", err2);
        return false;
      }
    }
  }

  async function handleButtonClick() {
    setButtonLoading(true);
    try {
      const bvid = extractBvid();
      if (!bvid) {
        throw new Error("当前页面未找到 BV 号");
      }
      const info = await fetchVideoInfo(bvid);
      const result = await fetchPlayUrl(bvid, info.cid);
      const copied = await copyToClipboard(result.url);
      if (!copied) {
        throw new Error("复制到剪贴板失败");
      }
      showMessage("success", "解析成功，已复制直链到剪贴板 ✨");
    } catch (err) {
      console.error("解析失败", err);
      showMessage("error", `解析失败：${err instanceof Error ? err.message : err}`);
    } finally {
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