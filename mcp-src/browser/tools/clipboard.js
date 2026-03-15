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
var clipboard_exports = {};
__export(clipboard_exports, {
  default: () => clipboard_default
});
module.exports = __toCommonJS(clipboard_exports);

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

function runPowerShell(script, timeout = 10000) {
  try {
    const result = execSync(
      "powershell.exe -NoProfile -NonInteractive -Command -",
      { input: script, encoding: "utf-8", timeout, windowsHide: true }
    );
    return { success: true, output: result.trim() };
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : "";
    return { success: false, error: stderr || e.message || String(e) };
  }
}

// ── Clipboard Read Text ─────────────────────────────────────────────

const clipboardRead = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "clipboard_read",
    title: "Read clipboard",
    description: "Read text from system clipboard.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const result = runPowerShell("Get-Clipboard -Raw");
    if (!result.success) throw new Error(`Clipboard read failed: ${result.error}`);
    if (!result.output) {
      response.addTextResult("Clipboard is empty (no text content).");
    } else {
      response.addTextResult(`## Clipboard Content\n\`\`\`\n${result.output}\n\`\`\``);
    }
  }
});

// ── Clipboard Write Text ────────────────────────────────────────────

const clipboardWrite = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "clipboard_write",
    title: "Write clipboard",
    description: "Write text to system clipboard.",
    inputSchema: import_mcpBundle.z.object({
      text: import_mcpBundle.z.string().describe("Text")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    // Write to temp file and use clip.exe for reliable handling of special chars
    const tempFile = path.join(os.tmpdir(), `clipboard-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, params.text, "utf-8");
    try {
      const script = `Get-Content -Path '${tempFile.replace(/'/g, "''")}' -Raw | Set-Clipboard`;
      const result = runPowerShell(script);
      if (!result.success) throw new Error(`Clipboard write failed: ${result.error}`);
      response.addTextResult(`Wrote ${params.text.length} characters to clipboard.`);
    } finally {
      try { fs.unlinkSync(tempFile); } catch (e) {}
    }
  }
});

// ── Clipboard Read Image ────────────────────────────────────────────

const clipboardReadImage = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "clipboard_read_image",
    title: "Read clipboard image",
    description: "Read image from clipboard as PNG.",
    inputSchema: import_mcpBundle.z.object({
      filename: import_mcpBundle.z.string().optional().describe("Filename")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const tempFile = path.join(os.tmpdir(), `clipboard-img-${Date.now()}.png`);
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) {
    Write-Output "NO_IMAGE"
} else {
    $img.Save('${tempFile.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Write-Output '${tempFile.replace(/\\/g, "\\\\")}'
}
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Clipboard image read failed: ${result.error}`);

    if (result.output === "NO_IMAGE") {
      response.addTextResult("No image in clipboard.");
      return;
    }

    const data = fs.readFileSync(tempFile);
    const resolvedFile = await response.resolveClientFile(
      { prefix: "clipboard", ext: "png", suggestedFilename: params.filename },
      "Clipboard image"
    );
    await response.addFileResult(resolvedFile, data);
    await response.registerImageResult(data, "png");
    try { fs.unlinkSync(tempFile); } catch (e) {}
  }
});

var clipboard_default = [
  clipboardRead,
  clipboardWrite,
  clipboardReadImage
];
