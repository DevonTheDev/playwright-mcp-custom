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
var status_exports = {};
__export(status_exports, {
  default: () => status_default
});
module.exports = __toCommonJS(status_exports);
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");
var import_response = require("../response");
var import_tab = require("../tab");

const browserStatus = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "browser_status",
    title: "Browser status",
    description: "Get browser health status including open tabs, modal states, and connection info.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const lines = [];

    // Browser connection status
    const hasBrowser = context._browserContextPromise != null;
    lines.push(`## Browser`);
    lines.push(`- Connected: ${hasBrowser ? "yes" : "no"}`);

    // Tab info
    const tabs = context.tabs();
    lines.push(`- Open tabs: ${tabs.length}`);

    if (tabs.length > 0) {
      const tabHeaders = await Promise.all(tabs.map((tab) => tab.headerSnapshot()));
      lines.push("");
      lines.push("## Tabs");
      lines.push(...(0, import_response.renderTabsMarkdown)(tabHeaders));
    }

    // Modal states across all tabs
    const allModals = [];
    for (const tab of tabs) {
      const modals = tab.modalStates();
      if (modals.length > 0) {
        allModals.push(...modals);
      }
    }
    if (allModals.length > 0) {
      lines.push("");
      lines.push("## Modal States");
      lines.push(...(0, import_tab.renderModalStates)(context.config, allModals));
    }

    // Grace period status
    if (context._closeGraceTimer) {
      lines.push("");
      lines.push("## Grace Period");
      lines.push("- Context teardown grace period is active (new tab will cancel it)");
    }

    response.addTextResult(lines.join("\n"));
  }
});

var status_default = [
  browserStatus
];
