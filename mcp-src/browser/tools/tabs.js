"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var tabs_exports = {};
__export(tabs_exports, {
  default: () => tabs_default
});
module.exports = __toCommonJS(tabs_exports);
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");
var import_response = require("../response");

const browserTabList = (0, import_tool.defineTool)({
  capability: "core-tabs",
  schema: {
    name: "browser_tab_list",
    title: "List tabs",
    description: "List all open browser tabs with their IDs, titles, and URLs.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    await context.ensureTab();
    const tabHeaders = await Promise.all(context.tabs().map((tab) => tab.headerSnapshot()));
    const result = (0, import_response.renderTabsMarkdown)(tabHeaders);
    response.addTextResult(result.join("\n"));
  }
});

const browserTabNew = (0, import_tool.defineTool)({
  capability: "core-tabs",
  schema: {
    name: "browser_tab_new",
    title: "Open new tab",
    description: "Open a new browser tab, optionally navigating to a URL.",
    inputSchema: import_mcpBundle.z.object({
      url: import_mcpBundle.z.string().optional().describe("URL to navigate to in the new tab. If omitted, opens about:blank.")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const tab = await context.newTab();
    if (params.url && tab) {
      await tab.navigate(params.url);
    }
    const tabHeaders = await Promise.all(context.tabs().map((t) => t.headerSnapshot()));
    const result = (0, import_response.renderTabsMarkdown)(tabHeaders);
    response.addTextResult(result.join("\n"));
    if (params.url)
      response.setIncludeSnapshot();
  }
});

const browserTabClose = (0, import_tool.defineTool)({
  capability: "core-tabs",
  schema: {
    name: "browser_tab_close",
    title: "Close tab",
    description: "Close a browser tab by its stable ID. If no ID is given, closes the current tab.",
    inputSchema: import_mcpBundle.z.object({
      tabId: import_mcpBundle.z.number().optional().describe("Tab ID to close. If omitted, closes the current tab.")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const url = await context.closeTab(params.tabId);
    response.addTextResult(`Closed tab with URL: ${url}`);
    const tabHeaders = await Promise.all(context.tabs().map((tab) => tab.headerSnapshot()));
    const result = (0, import_response.renderTabsMarkdown)(tabHeaders);
    response.addTextResult(result.join("\n"));
  }
});

const browserTabSelect = (0, import_tool.defineTool)({
  capability: "core-tabs",
  schema: {
    name: "browser_tab_select",
    title: "Select tab",
    description: "Switch to a browser tab by its stable ID. Automatically returns a snapshot of the selected tab.",
    inputSchema: import_mcpBundle.z.object({
      tabId: import_mcpBundle.z.number().describe("Tab ID to select.")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    await context.selectTab(params.tabId);
    const tabHeaders = await Promise.all(context.tabs().map((tab) => tab.headerSnapshot()));
    const result = (0, import_response.renderTabsMarkdown)(tabHeaders);
    response.addTextResult(result.join("\n"));
    response.setIncludeSnapshot();
  }
});

var tabs_default = [
  browserTabList,
  browserTabNew,
  browserTabClose,
  browserTabSelect
];
