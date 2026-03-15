"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
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
var persistentState_exports = {};
__export(persistentState_exports, {
  default: () => persistentState_default
});
module.exports = __toCommonJS(persistentState_exports);

const fs = require("fs");
const path = require("path");
const os = require("os");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

// ── State file management ───────────────────────────────────────────

const STATE_DIR = path.join(os.homedir(), ".playwright-mcp");
const STATE_FILE = path.join(STATE_DIR, "persistent-state.json");

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR))
    fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  ensureStateDir();
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveState(state) {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ── State Set ───────────────────────────────────────────────────────

const stateSet = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "state_set",
    title: "Set persistent state",
    description: "Store a key-value pair in persistent storage that survives across MCP sessions. Values can be any JSON-serializable type.",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().describe("Key to store under"),
      value: import_mcpBundle.z.any().describe("Value to store (string, number, object, array, boolean)"),
      namespace: import_mcpBundle.z.string().default("default").describe("Optional namespace to organize keys")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const state = loadState();
    if (!state[params.namespace]) state[params.namespace] = {};
    state[params.namespace][params.key] = {
      value: params.value,
      updatedAt: new Date().toISOString()
    };
    saveState(state);
    response.addTextResult(`Stored "${params.key}" in namespace "${params.namespace}"`);
  }
});

// ── State Get ───────────────────────────────────────────────────────

const stateGet = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "state_get",
    title: "Get persistent state",
    description: "Retrieve a value from persistent storage by key.",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().describe("Key to look up"),
      namespace: import_mcpBundle.z.string().default("default").describe("Namespace to look in")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const state = loadState();
    const ns = state[params.namespace];
    if (!ns || !ns[params.key]) {
      response.addTextResult(`Key "${params.key}" not found in namespace "${params.namespace}".`);
      return;
    }
    const entry = ns[params.key];
    const valueStr = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value, null, 2);
    response.addTextResult(`## ${params.key}\n\`\`\`\n${valueStr}\n\`\`\`\n\nLast updated: ${entry.updatedAt}`);
  }
});

// ── State List ──────────────────────────────────────────────────────

const stateList = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "state_list",
    title: "List persistent state",
    description: "List all keys in persistent storage, optionally filtered by namespace.",
    inputSchema: import_mcpBundle.z.object({
      namespace: import_mcpBundle.z.string().optional().describe("Namespace to list. If omitted, lists all namespaces and their keys.")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const state = loadState();
    const lines = ["## Persistent State"];

    if (params.namespace) {
      const ns = state[params.namespace];
      if (!ns || Object.keys(ns).length === 0) {
        lines.push(`\nNamespace "${params.namespace}" is empty.`);
      } else {
        lines.push(`\n### ${params.namespace}`);
        for (const [key, entry] of Object.entries(ns)) {
          const preview = typeof entry.value === "string"
            ? entry.value.slice(0, 80) + (entry.value.length > 80 ? "..." : "")
            : JSON.stringify(entry.value).slice(0, 80);
          lines.push(`- **${key}**: ${preview} _(${entry.updatedAt})_`);
        }
      }
    } else {
      const namespaces = Object.keys(state);
      if (namespaces.length === 0) {
        lines.push("\nNo stored data.");
      } else {
        for (const ns of namespaces) {
          const keys = Object.keys(state[ns]);
          lines.push(`\n### ${ns} (${keys.length} keys)`);
          for (const key of keys) {
            const entry = state[ns][key];
            const preview = typeof entry.value === "string"
              ? entry.value.slice(0, 60) + (entry.value.length > 60 ? "..." : "")
              : JSON.stringify(entry.value).slice(0, 60);
            lines.push(`- **${key}**: ${preview}`);
          }
        }
      }
    }

    lines.push(`\nState file: ${STATE_FILE}`);
    response.addTextResult(lines.join("\n"));
  }
});

// ── State Delete ────────────────────────────────────────────────────

const stateDelete = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "state_delete",
    title: "Delete persistent state",
    description: "Delete a key from persistent storage, or clear an entire namespace.",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().optional().describe("Key to delete. If omitted, deletes the entire namespace."),
      namespace: import_mcpBundle.z.string().default("default").describe("Namespace to operate on")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const state = loadState();
    if (params.key) {
      if (state[params.namespace]) {
        delete state[params.namespace][params.key];
        if (Object.keys(state[params.namespace]).length === 0)
          delete state[params.namespace];
      }
      saveState(state);
      response.addTextResult(`Deleted key "${params.key}" from namespace "${params.namespace}".`);
    } else {
      delete state[params.namespace];
      saveState(state);
      response.addTextResult(`Deleted entire namespace "${params.namespace}".`);
    }
  }
});

var persistentState_default = [
  stateSet,
  stateGet,
  stateList,
  stateDelete
];
