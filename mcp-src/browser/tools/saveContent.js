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
var saveContent_exports = {};
__export(saveContent_exports, {
  default: () => saveContent_default
});
module.exports = __toCommonJS(saveContent_exports);
var import_fs = require("fs");
var import_path = require("path");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

const browserSaveContent = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "browser_save_content",
    title: "Save content to file",
    description: "Save text content (HTML, JSON, extracted text, etc.) to a file on disk.",
    inputSchema: import_mcpBundle.z.object({
      content: import_mcpBundle.z.string().describe("Text content to save."),
      filename: import_mcpBundle.z.string().describe("Filename to save as (e.g. 'page.html', 'data.json').")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const outputFile = await context.outputFile(
      { suggestedFilename: params.filename, prefix: "content", ext: "txt" },
      { origin: "code" }
    );
    await import_fs.promises.writeFile(outputFile, params.content, "utf-8");
    const absolutePath = (0, import_path.resolve)(outputFile);
    response.addTextResult(`Saved content to: ${absolutePath} (${params.content.length} characters)`);
  }
});

var saveContent_default = [
  browserSaveContent
];
