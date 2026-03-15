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
var webstorage_exports = {};
__export(webstorage_exports, {
  default: () => webstorage_default
});
module.exports = __toCommonJS(webstorage_exports);
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

const storageTypeParam = import_mcpBundle.z.enum(["local", "session"]).default("local").describe("local or session");

function getStorage(type) {
  return type === "session" ? "sessionStorage" : "localStorage";
}

const webstorageList = (0, import_tool.defineTabTool)({
  capability: "storage",
  schema: {
    name: "browser_webstorage_list",
    title: "List web storage",
    description: "List all key-value pairs in localStorage or sessionStorage.",
    inputSchema: import_mcpBundle.z.object({ storageType: storageTypeParam }),
    type: "readOnly"
  },
  handle: async (tab, params, response) => {
    const s = getStorage(params.storageType);
    const items = await tab.page.evaluate((storage) => {
      const st = storage === "sessionStorage" ? sessionStorage : localStorage;
      const result = [];
      for (let i = 0; i < st.length; i++) {
        const key = st.key(i);
        if (key !== null) result.push({ key, value: st.getItem(key) || "" });
      }
      return result;
    }, s);
    if (items.length === 0) response.addTextResult(`No ${s} items`);
    else response.addTextResult(items.map((item) => `${item.key}=${item.value}`).join("\n"));
  }
});

const webstorageGet = (0, import_tool.defineTabTool)({
  capability: "storage",
  schema: {
    name: "browser_webstorage_get",
    title: "Get web storage item",
    description: "Get a value by key from localStorage or sessionStorage.",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().describe("Key"),
      storageType: storageTypeParam
    }),
    type: "readOnly"
  },
  handle: async (tab, params, response) => {
    const s = getStorage(params.storageType);
    const value = await tab.page.evaluate(({ storage, key }) => {
      return (storage === "sessionStorage" ? sessionStorage : localStorage).getItem(key);
    }, { storage: s, key: params.key });
    if (value === null) response.addTextResult(`Key '${params.key}' not found`);
    else response.addTextResult(`${params.key}=${value}`);
  }
});

const webstorageSet = (0, import_tool.defineTabTool)({
  capability: "storage",
  schema: {
    name: "browser_webstorage_set",
    title: "Set web storage item",
    description: "Set a key-value pair in localStorage or sessionStorage.",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().describe("Key"),
      value: import_mcpBundle.z.string().describe("Value"),
      storageType: storageTypeParam
    }),
    type: "action"
  },
  handle: async (tab, params, response) => {
    const s = getStorage(params.storageType);
    await tab.page.evaluate(({ storage, key, value }) => {
      (storage === "sessionStorage" ? sessionStorage : localStorage).setItem(key, value);
    }, { storage: s, key: params.key, value: params.value });
  }
});

const webstorageDelete = (0, import_tool.defineTabTool)({
  capability: "storage",
  schema: {
    name: "browser_webstorage_delete",
    title: "Delete web storage item",
    description: "Delete a key from localStorage or sessionStorage.",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().describe("Key"),
      storageType: storageTypeParam
    }),
    type: "action"
  },
  handle: async (tab, params, response) => {
    const s = getStorage(params.storageType);
    await tab.page.evaluate(({ storage, key }) => {
      (storage === "sessionStorage" ? sessionStorage : localStorage).removeItem(key);
    }, { storage: s, key: params.key });
  }
});

const webstorageClear = (0, import_tool.defineTabTool)({
  capability: "storage",
  schema: {
    name: "browser_webstorage_clear",
    title: "Clear web storage",
    description: "Clear all localStorage or sessionStorage.",
    inputSchema: import_mcpBundle.z.object({ storageType: storageTypeParam }),
    type: "action"
  },
  handle: async (tab, params, response) => {
    const s = getStorage(params.storageType);
    await tab.page.evaluate((storage) => {
      (storage === "sessionStorage" ? sessionStorage : localStorage).clear();
    }, s);
  }
});

var webstorage_default = [
  webstorageList,
  webstorageGet,
  webstorageSet,
  webstorageDelete,
  webstorageClear
];
