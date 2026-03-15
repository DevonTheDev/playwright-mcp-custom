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
var cookies_exports = {};
__export(cookies_exports, {
  default: () => cookies_default
});
module.exports = __toCommonJS(cookies_exports);
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

const cookieGet = (0, import_tool.defineTool)({
  capability: "storage",
  schema: {
    name: "browser_cookie_get",
    title: "Get cookies",
    description: "List cookies, optionally filtered by name or domain.",
    inputSchema: import_mcpBundle.z.object({
      name: import_mcpBundle.z.string().optional().describe("Filter by cookie name"),
      domain: import_mcpBundle.z.string().optional().describe("Filter by domain")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const browserContext = await context.ensureBrowserContext();
    let cookies = await browserContext.cookies();
    if (params.name) cookies = cookies.filter((c) => c.name === params.name);
    if (params.domain) cookies = cookies.filter((c) => c.domain.includes(params.domain));
    if (cookies.length === 0) response.addTextResult("No cookies found");
    else response.addTextResult(cookies.map((c) => `${c.name}=${c.value} (${c.domain}${c.path})`).join("\n"));
  }
});

const cookieSet = (0, import_tool.defineTool)({
  capability: "storage",
  schema: {
    name: "browser_cookie_set",
    title: "Set cookie",
    description: "Set a cookie.",
    inputSchema: import_mcpBundle.z.object({
      name: import_mcpBundle.z.string().describe("Name"),
      value: import_mcpBundle.z.string().describe("Value"),
      domain: import_mcpBundle.z.string().optional().describe("Domain"),
      path: import_mcpBundle.z.string().optional().describe("Path"),
      expires: import_mcpBundle.z.number().optional().describe("Unix timestamp"),
      httpOnly: import_mcpBundle.z.boolean().optional(),
      secure: import_mcpBundle.z.boolean().optional(),
      sameSite: import_mcpBundle.z.enum(["Strict", "Lax", "None"]).optional()
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const browserContext = await context.ensureBrowserContext();
    const tab = await context.ensureTab();
    const url = new URL(tab.page.url());
    const cookie = {
      name: params.name,
      value: params.value,
      domain: params.domain || url.hostname,
      path: params.path || "/"
    };
    if (params.expires !== void 0) cookie.expires = params.expires;
    if (params.httpOnly !== void 0) cookie.httpOnly = params.httpOnly;
    if (params.secure !== void 0) cookie.secure = params.secure;
    if (params.sameSite !== void 0) cookie.sameSite = params.sameSite;
    await browserContext.addCookies([cookie]);
  }
});

const cookieClear = (0, import_tool.defineTool)({
  capability: "storage",
  schema: {
    name: "browser_cookie_clear",
    title: "Clear cookies",
    description: "Clear cookies. If name is given, clears that cookie only; otherwise clears all.",
    inputSchema: import_mcpBundle.z.object({
      name: import_mcpBundle.z.string().optional().describe("Cookie name to delete, or omit to clear all")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const browserContext = await context.ensureBrowserContext();
    if (params.name)
      await browserContext.clearCookies({ name: params.name });
    else
      await browserContext.clearCookies();
  }
});

var cookies_default = [
  cookieGet,
  cookieSet,
  cookieClear
];
