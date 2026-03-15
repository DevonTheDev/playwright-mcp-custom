"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var runCode_exports = {};
__export(runCode_exports, {
  default: () => runCode_default
});
module.exports = __toCommonJS(runCode_exports);
var import_vm = __toESM(require("vm"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_url = __toESM(require("url"));
var import_crypto = __toESM(require("crypto"));
var import_utils = require("playwright-core/lib/utils");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

const allowedModules = {
  fs: import_fs.default,
  path: import_path.default,
  url: import_url.default,
  crypto: import_crypto.default
};

function safeRequire(moduleName) {
  if (allowedModules[moduleName])
    return allowedModules[moduleName];
  throw new Error(`Module "${moduleName}" is not allowed. Allowed modules: ${Object.keys(allowedModules).join(", ")}`);
}

const codeSchema = import_mcpBundle.z.object({
  code: import_mcpBundle.z.string().describe("JS code: arrow function (page, browserContext) => {...} or plain code block. Has require(fs,path,url,crypto), console, setTimeout.")
});

const runCode = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_run_code",
    title: "Run Playwright code",
    description: "Run Playwright code with page, browserContext, and Node builtins.",
    inputSchema: codeSchema,
    type: "action"
  },
  handle: async (tab, params, response) => {
    const code = params.code.trim();
    const isArrowOrFunction = /^(async\s+)?(function|\()/.test(code);

    // Get or create persistent VM context on the Context object
    if (!tab.context._vmContext) {
      const vmCtx = {
        console,
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        require: safeRequire,
        Buffer,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        JSON,
        Promise,
        // Persistent state across calls
        __state__: {}
      };
      import_vm.default.createContext(vmCtx);
      tab.context._vmContext = vmCtx;
    }

    const vmContext = tab.context._vmContext;
    // Update per-call bindings
    vmContext.page = tab.page;
    vmContext.browserContext = await tab.context.ensureBrowserContext();

    const __end__ = new import_utils.ManualPromise();
    vmContext.__end__ = __end__;

    let snippet;
    if (isArrowOrFunction) {
      response.addCode(`await (${code})(page, browserContext);`);
      snippet = `(async () => {
        try {
          const result = await (${code})(page, browserContext);
          __end__.resolve(JSON.stringify(result));
        } catch (e) {
          __end__.reject(e);
        }
      })()`;
    } else {
      response.addCode(code);
      snippet = `(async () => {
        try {
          const result = await (async () => { ${code} })();
          __end__.resolve(JSON.stringify(result));
        } catch (e) {
          __end__.reject(e);
        }
      })()`;
    }

    await tab.waitForCompletion(async () => {
      await import_vm.default.runInContext(snippet, vmContext);
      const result = await __end__;
      if (typeof result === "string")
        response.addTextResult(result);
    });
  }
});
var runCode_default = [
  runCode
];
