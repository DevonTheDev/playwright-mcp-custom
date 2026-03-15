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
var download_exports = {};
__export(download_exports, {
  default: () => download_default
});
module.exports = __toCommonJS(download_exports);
var import_path = require("path");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

const browserDownloadFile = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_download_file",
    title: "Download file",
    description: "Download a file from a URL to disk using the browser's network context (cookies/auth are preserved).",
    inputSchema: import_mcpBundle.z.object({
      url: import_mcpBundle.z.string().describe("URL of the file to download."),
      filename: import_mcpBundle.z.string().optional().describe("Filename to save as. If omitted, derived from URL.")
    }),
    type: "action"
  },
  handle: async (tab, params, response) => {
    const suggestedFilename = params.filename || decodeURIComponent(params.url.split("/").pop().split("?")[0]) || "download";
    const outputFile = await tab.context.outputFile(
      { suggestedFilename, prefix: "download", ext: "bin" },
      { origin: "code" }
    );
    const download = await tab.page.waitForEvent("download", {
      predicate: () => true,
      timeout: 60000
    }).catch(() => null);

    // If no automatic download triggered, use evaluate to fetch
    if (!download) {
      await tab.page.evaluate(async ({ url, filename }) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, { url: params.url, filename: suggestedFilename });
    }

    // Try a more reliable approach: navigate to trigger download
    const { promise: downloadEvent } = eventWaiter(tab.page, "download", 30000);
    try {
      // Use CDP to initiate download
      const cdpSession = await tab.page.context().newCDPSession(tab.page);
      await cdpSession.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: (0, import_path.dirname)(outputFile)
      }).catch(() => {});
      await cdpSession.detach().catch(() => {});
    } catch (e) {
      // Fallback: direct navigation
    }

    // Use page.evaluate with fetch API to download the file
    const buffer = await tab.page.evaluate(async (url) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, params.url);

    const fs = require("fs");
    await fs.promises.writeFile(outputFile, Buffer.from(buffer));

    const absolutePath = (0, import_path.resolve)(outputFile);
    response.addTextResult(`Downloaded file to: ${absolutePath}`);
  }
});

function eventWaiter(page, event, timeout) {
  const disposables = [];
  const eventPromise = new Promise((resolve) => {
    page.on(event, resolve);
    disposables.push(() => page.off(event, resolve));
  });
  let abort;
  const abortPromise = new Promise((resolve) => { abort = () => resolve(void 0); });
  const timeoutPromise = new Promise((f) => {
    const timeoutId = setTimeout(() => f(void 0), timeout);
    disposables.push(() => clearTimeout(timeoutId));
  });
  return {
    promise: Promise.race([eventPromise, abortPromise, timeoutPromise])
      .finally(() => disposables.forEach((dispose) => dispose())),
    abort
  };
}

var download_default = [
  browserDownloadFile
];
