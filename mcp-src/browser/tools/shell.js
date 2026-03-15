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
var shell_exports = {};
__export(shell_exports, {
  default: () => shell_default
});
module.exports = __toCommonJS(shell_exports);

const { execSync } = require("child_process");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");
var import_psSession = require("./powershellSession");

// ── Shell Execute ───────────────────────────────────────────────────

const shellExec = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "shell_exec",
    title: "Execute shell command",
    description: "Run a shell command, return stdout/stderr.",
    inputSchema: import_mcpBundle.z.object({
      command: import_mcpBundle.z.string().describe("Command"),
      cwd: import_mcpBundle.z.string().optional().describe("Working directory"),
      timeout: import_mcpBundle.z.number().default(30000).describe("Timeout ms (max 120000)"),
      shell: import_mcpBundle.z.enum(["cmd", "powershell", "bash"]).default("cmd")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const timeout = Math.min(params.timeout || 30000, 120000);

    let shellCmd;
    switch (params.shell) {
      case "powershell":
        shellCmd = "powershell.exe -NoProfile -NonInteractive -Command -";
        break;
      case "bash":
        shellCmd = "bash";
        break;
      default:
        shellCmd = true; // Use default shell (cmd.exe on Windows)
    }

    const options = {
      encoding: "utf-8",
      timeout,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024, // 10MB max output
      cwd: params.cwd || undefined,
    };

    if (params.shell === "powershell") {
      options.input = params.command;
      options.shell = undefined;
    }

    try {
      let stdout;
      if (params.shell === "powershell") {
        stdout = execSync(shellCmd, { ...options });
      } else {
        options.shell = shellCmd === true ? true : shellCmd;
        stdout = execSync(params.command, options);
      }

      const output = stdout.trim();
      const lines = [];
      lines.push(`## Command\n\`${params.command}\``);
      if (output) {
        lines.push(`\n## Output\n\`\`\`\n${output.slice(0, 10000)}\n\`\`\``);
        if (output.length > 10000) lines.push(`\n(output truncated, ${output.length} total chars)`);
      } else {
        lines.push("\n## Output\n(no output)");
      }
      lines.push("\n## Exit Code\n0");
      response.addTextResult(lines.join("\n"));
    } catch (e) {
      const stdout = e.stdout ? e.stdout.toString().trim() : "";
      const stderr = e.stderr ? e.stderr.toString().trim() : "";
      const exitCode = e.status ?? "unknown";
      const lines = [];
      lines.push(`## Command\n\`${params.command}\``);
      if (stdout) lines.push(`\n## Stdout\n\`\`\`\n${stdout.slice(0, 5000)}\n\`\`\``);
      if (stderr) lines.push(`\n## Stderr\n\`\`\`\n${stderr.slice(0, 5000)}\n\`\`\``);
      lines.push(`\n## Exit Code\n${exitCode}`);
      response.addTextResult(lines.join("\n"));
    }
  }
});

// ── Shell Execute PowerShell ────────────────────────────────────────

const shellPowerShell = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "shell_powershell",
    title: "Run PowerShell script",
    description: "Run a PowerShell script with .NET access.",
    inputSchema: import_mcpBundle.z.object({
      script: import_mcpBundle.z.string().describe("Script"),
      timeout: import_mcpBundle.z.number().default(30000).describe("Timeout ms")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const timeout = Math.min(params.timeout || 30000, 120000);
    const result = await import_psSession.runPowerShell(params.script, timeout);
    const lines = [];
    if (result.success) {
      if (result.output) {
        lines.push(`\`\`\`\n${result.output.slice(0, 10000)}\n\`\`\``);
        if (result.output.length > 10000) lines.push(`(truncated, ${result.output.length} total chars)`);
      } else {
        lines.push("(no output)");
      }
    } else {
      lines.push(`Error: ${result.error?.slice(0, 5000) || "unknown"}`);
    }
    response.addTextResult(lines.join("\n"));
  }
});

var shell_default = [
  shellExec,
  shellPowerShell
];
