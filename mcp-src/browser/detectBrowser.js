"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var detectBrowser_exports = {};
__export(detectBrowser_exports, {
  detectExistingBrowser: () => detectExistingBrowser
});
module.exports = __toCommonJS(detectBrowser_exports);

const http = require("http");

const COMMON_CDP_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229];

function fetchJson(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Invalid JSON response"));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

async function tryPort(port) {
  try {
    const versionInfo = await fetchJson(`http://localhost:${port}/json/version`);
    if (versionInfo && versionInfo.webSocketDebuggerUrl) {
      return {
        port,
        webSocketDebuggerUrl: versionInfo.webSocketDebuggerUrl,
        browser: versionInfo.Browser || "Unknown",
        protocol: versionInfo["Protocol-Version"] || "unknown"
      };
    }
  } catch (e) {
    // Port not responding or not a CDP endpoint
  }
  return null;
}

async function detectExistingBrowser() {
  // Try all common ports in parallel
  const results = await Promise.all(COMMON_CDP_PORTS.map(tryPort));
  for (const result of results) {
    if (result)
      return result;
  }
  return null;
}

// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectExistingBrowser
});
