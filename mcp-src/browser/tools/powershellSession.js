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
var psSession_exports = {};
__export(psSession_exports, {
  getSession: () => getSession,
  runPowerShell: () => runPowerShell
});
module.exports = __toCommonJS(psSession_exports);

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Preload script: compiled once per session ───────────────────────

const PRELOAD_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Input {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
    public const uint RIGHTDOWN = 0x0008, RIGHTUP = 0x0010;
    public const uint MIDDLEDOWN = 0x0020, MIDDLEUP = 0x0040;
    public const uint WHEEL = 0x0800;
    public const int SW_RESTORE = 9, SW_SHOW = 5, SW_MINIMIZE = 6, SW_MAXIMIZE = 3;
}
"@
`;

// ── Persistent PowerShell Session ───────────────────────────────────

class PowerShellSession {
  constructor() {
    this._process = null;
    this._preloaded = false;
    this._queue = [];
    this._processing = false;
    this._outputBuffer = "";
    this._currentMarker = null;
    this._currentResolve = null;
    this._currentReject = null;
    this._currentTimeout = null;
  }

  _ensureProcess() {
    if (this._process && !this._process.killed && this._process.exitCode === null)
      return;

    this._process = spawn("powershell.exe", [
      "-NoProfile", "-NoExit", "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", "-"
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this._process.stdout.setEncoding("utf-8");
    this._process.stderr.setEncoding("utf-8");

    this._process.stdout.on("data", (data) => this._onData(data));
    this._process.stderr.on("data", (data) => this._onData(data));

    this._process.on("exit", () => {
      this._process = null;
      this._preloaded = false;
      // Reject any pending command
      if (this._currentReject) {
        this._currentReject(new Error("PowerShell process exited unexpectedly"));
        this._currentResolve = null;
        this._currentReject = null;
      }
    });

    this._preloaded = false;
  }

  _onData(data) {
    if (!this._currentMarker) return;

    this._outputBuffer += data;

    // Check if the marker is in the buffer
    const markerIdx = this._outputBuffer.indexOf(this._currentMarker);
    if (markerIdx !== -1) {
      const output = this._outputBuffer.substring(0, markerIdx).trim();
      this._outputBuffer = this._outputBuffer.substring(markerIdx + this._currentMarker.length);

      if (this._currentTimeout) {
        clearTimeout(this._currentTimeout);
        this._currentTimeout = null;
      }

      const resolve = this._currentResolve;
      this._currentResolve = null;
      this._currentReject = null;
      this._currentMarker = null;

      // Check for error marker
      const errIdx = output.indexOf("___MCP_ERR___");
      if (errIdx !== -1) {
        const errMsg = output.substring(errIdx + "___MCP_ERR___".length).trim();
        resolve({ success: false, output: "", error: errMsg });
      } else {
        resolve({ success: true, output });
      }

      // Process next in queue
      this._processing = false;
      this._processQueue();
    }
  }

  async _preload() {
    if (this._preloaded) return;
    // Write preload script to temp file and dot-source it
    const tmpFile = path.join(os.tmpdir(), `mcp-ps-preload-${process.pid}.ps1`);
    fs.writeFileSync(tmpFile, PRELOAD_SCRIPT, "utf-8");
    const marker = `___MCP_PRELOAD_${Date.now()}___`;

    await new Promise((resolve, reject) => {
      this._currentResolve = (result) => resolve(result);
      this._currentReject = reject;
      this._currentMarker = marker;
      this._outputBuffer = "";

      this._currentTimeout = setTimeout(() => {
        this._currentReject?.(new Error("Preload timed out"));
        this._currentResolve = null;
        this._currentReject = null;
        this._currentMarker = null;
      }, 15000);

      this._process.stdin.write(`. '${tmpFile.replace(/'/g, "''")}'; Write-Host '${marker}'\n`);
    });

    try { fs.unlinkSync(tmpFile); } catch (e) {}
    this._preloaded = true;
  }

  async exec(script, timeout = 15000) {
    return new Promise((resolve, reject) => {
      this._queue.push({ script, timeout, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this._processing || this._queue.length === 0) return;
    this._processing = true;

    const { script, timeout, resolve, reject } = this._queue.shift();

    try {
      this._ensureProcess();
      if (!this._preloaded) {
        await this._preload();
      }

      // Write script to temp file
      const tmpFile = path.join(os.tmpdir(), `mcp-ps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
      fs.writeFileSync(tmpFile, script, "utf-8");

      const marker = `___MCP_DONE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}___`;

      this._currentResolve = (result) => {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        resolve(result);
      };
      this._currentReject = (err) => {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        reject(err);
      };
      this._currentMarker = marker;
      this._outputBuffer = "";

      this._currentTimeout = setTimeout(() => {
        if (this._currentReject) {
          try { fs.unlinkSync(tmpFile); } catch (e) {}
          this._currentReject(new Error("Command timed out"));
          this._currentResolve = null;
          this._currentReject = null;
          this._currentMarker = null;
          this._processing = false;
          this._processQueue();
        }
      }, timeout);

      // Dot-source the script in the persistent process
      // Wrap in try/catch to capture errors
      const cmd = `try { . '${tmpFile.replace(/'/g, "''")}' } catch { Write-Host '___MCP_ERR___'; Write-Host $_.Exception.Message }; Write-Host '${marker}'\n`;
      this._process.stdin.write(cmd);

    } catch (e) {
      this._processing = false;
      reject(e);
      this._processQueue();
    }
  }

  dispose() {
    if (this._process) {
      try {
        this._process.stdin.end();
        this._process.kill();
      } catch (e) {}
      this._process = null;
      this._preloaded = false;
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let _session = null;

function getSession() {
  if (!_session)
    _session = new PowerShellSession();
  return _session;
}

/**
 * Drop-in replacement for the old runPowerShell function.
 * Uses the persistent session for speed, with fallback to process spawn.
 */
async function runPowerShell(script, timeout = 15000) {
  try {
    return await getSession().exec(script, timeout);
  } catch (e) {
    // Fallback: spawn a fresh process (in case session is broken)
    const tmpScript = path.join(os.tmpdir(), `mcp-ps-fb-${Date.now()}.ps1`);
    try {
      fs.writeFileSync(tmpScript, script, "utf-8");
      const result = execSync(
        `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpScript}"`,
        { encoding: "utf-8", timeout, windowsHide: true }
      );
      return { success: true, output: result.trim() };
    } catch (e2) {
      const stderr = e2.stderr ? e2.stderr.toString().trim() : "";
      return { success: false, error: stderr || e2.message || String(e2) };
    } finally {
      try { fs.unlinkSync(tmpScript); } catch (e3) {}
    }
  }
}

// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getSession,
  runPowerShell
});
