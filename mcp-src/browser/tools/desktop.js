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
var desktop_exports = {};
__export(desktop_exports, {
  default: () => desktop_default
});
module.exports = __toCommonJS(desktop_exports);

const fs = require("fs");
const path = require("path");
const os = require("os");
var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");
var import_psSession = require("./powershellSession");

// Use persistent PS session - Win32 types, Forms, Drawing are preloaded
const runPowerShell = import_psSession.runPowerShell;

// ── Key combo mapping ───────────────────────────────────────────────

function keyComboToSendKeys(combo) {
  const keyMap = {
    "enter": "{ENTER}", "return": "{ENTER}",
    "tab": "{TAB}", "escape": "{ESC}", "esc": "{ESC}",
    "backspace": "{BACKSPACE}", "bs": "{BACKSPACE}",
    "delete": "{DELETE}", "del": "{DELETE}",
    "insert": "{INSERT}", "ins": "{INSERT}",
    "home": "{HOME}", "end": "{END}",
    "pageup": "{PGUP}", "pagedown": "{PGDN}",
    "up": "{UP}", "down": "{DOWN}", "left": "{LEFT}", "right": "{RIGHT}",
    "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}",
    "f5": "{F5}", "f6": "{F6}", "f7": "{F7}", "f8": "{F8}",
    "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}",
    "space": " ", "plus": "{+}", "caret": "{^}", "tilde": "{~}",
    "prtsc": "{PRTSC}", "break": "{BREAK}", "capslock": "{CAPSLOCK}",
    "scrolllock": "{SCROLLLOCK}", "numlock": "{NUMLOCK}",
    "win": "^{ESC}", "apps": "+{F10}"
  };

  const parts = combo.toLowerCase().split("+").map(s => s.trim());
  let modifiers = "";
  let key = "";

  for (const part of parts) {
    if (part === "ctrl" || part === "control") modifiers += "^";
    else if (part === "alt") modifiers += "%";
    else if (part === "shift") modifiers += "+";
    else if (keyMap[part]) key = keyMap[part];
    else if (part.length === 1) key = part;
    else key = `{${part.toUpperCase()}}`;
  }

  return modifiers + (key.startsWith("{") ? key : key);
}

function escapeSendKeys(text) {
  return text.replace(/([{}+^%~()[\]])/g, "{$1}");
}

// ── Desktop Screenshot ──────────────────────────────────────────────

const desktopScreenshot = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_screenshot",
    title: "Desktop screenshot",
    description: "Screenshot the desktop or a specific window.",
    inputSchema: import_mcpBundle.z.object({
      windowTitle: import_mcpBundle.z.string().optional().describe("Window title to capture (partial match). Omit for full desktop."),
      monitor: import_mcpBundle.z.number().optional().describe("Monitor number (1-based). Omit to capture all monitors."),
      filename: import_mcpBundle.z.string().optional().describe("Filename to save as")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const tempFile = path.join(os.tmpdir(), `desktop-screenshot-${Date.now()}.png`);

    let script;
    const safePath = tempFile.replace(/\\/g, "\\\\");
    if (params.windowTitle) {
      // Capture specific window
      const escapedTitle = params.windowTitle.replace(/'/g, "''");
      script = `


$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${escapedTitle}*' -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $proc) { Write-Error "No window found matching '${escapedTitle}'"; exit 1 }
$hwnd = $proc.MainWindowHandle
[Win32Input]::ShowWindow($hwnd, [Win32Input]::SW_RESTORE) | Out-Null
Start-Sleep -Milliseconds 200
$rect = New-Object Win32Input+RECT
[Win32Input]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left; $h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { Write-Error "Invalid window dimensions"; exit 1 }
$bitmap = New-Object System.Drawing.Bitmap($w, $h)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bitmap.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
Write-Output '${safePath}'
`;
    } else if (params.monitor) {
      // Capture a specific monitor by number (1-based)
      const monIdx = params.monitor - 1;
      script = `

$screens = [System.Windows.Forms.Screen]::AllScreens
if (${monIdx} -ge $screens.Length) { Write-Error "Monitor ${params.monitor} not found. Available: $($screens.Length)"; exit 1 }
$bounds = $screens[${monIdx}].Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
$bitmap.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
Write-Output '${safePath}'
`;
    } else {
      // Full desktop capture spanning ALL monitors
      script = `

$screens = [System.Windows.Forms.Screen]::AllScreens
if ($screens.Length -eq 1) {
  $bounds = $screens[0].Bounds
} else {
  [int]$minX = [int]($screens | ForEach-Object { $_.Bounds.X } | Measure-Object -Minimum).Minimum
  [int]$minY = [int]($screens | ForEach-Object { $_.Bounds.Y } | Measure-Object -Minimum).Minimum
  [int]$maxX = [int]($screens | ForEach-Object { $_.Bounds.X + $_.Bounds.Width } | Measure-Object -Maximum).Maximum
  [int]$maxY = [int]($screens | ForEach-Object { $_.Bounds.Y + $_.Bounds.Height } | Measure-Object -Maximum).Maximum
  $bounds = New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX), ($maxY - $minY))
}
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
$bitmap.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
Write-Output '${safePath}'
`;
    }

    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Screenshot failed: ${result.error}`);

    const data = fs.readFileSync(tempFile);
    const resolvedFile = await response.resolveClientFile(
      { prefix: "desktop", ext: "png", suggestedFilename: params.filename },
      "Desktop screenshot"
    );
    await response.addFileResult(resolvedFile, data);
    await response.registerImageResult(data, "png");

    // Clean up temp file
    try { fs.unlinkSync(tempFile); } catch (e) {}
  }
});

// ── Desktop Click ───────────────────────────────────────────────────

const desktopClick = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_click",
    title: "Desktop click",
    description: "Click at screen coordinates.",
    inputSchema: import_mcpBundle.z.object({
      x: import_mcpBundle.z.number().describe("X"),
      y: import_mcpBundle.z.number().describe("Y"),
      button: import_mcpBundle.z.enum(["left", "right", "middle"]).default("left"),
      doubleClick: import_mcpBundle.z.boolean().default(false)
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const btnDown = params.button === "right" ? "RIGHTDOWN" : params.button === "middle" ? "MIDDLEDOWN" : "LEFTDOWN";
    const btnUp = params.button === "right" ? "RIGHTUP" : params.button === "middle" ? "MIDDLEUP" : "LEFTUP";
    const clicks = params.doubleClick ? 2 : 1;

    let clickCode = "";
    for (let i = 0; i < clicks; i++) {
      clickCode += `[Win32Input]::mouse_event([Win32Input]::${btnDown}, 0, 0, 0, [IntPtr]::Zero)\n`;
      clickCode += `[Win32Input]::mouse_event([Win32Input]::${btnUp}, 0, 0, 0, [IntPtr]::Zero)\n`;
      if (i < clicks - 1) clickCode += `Start-Sleep -Milliseconds 50\n`;
    }

    const script = `

[Win32Input]::SetCursorPos(${params.x}, ${params.y}) | Out-Null
Start-Sleep -Milliseconds 50
${clickCode}
Write-Output "Clicked at (${params.x}, ${params.y})"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Click failed: ${result.error}`);
    response.addTextResult(`${params.doubleClick ? "Double-clicked" : "Clicked"} ${params.button} button at (${params.x}, ${params.y})`);
  }
});

// ── Desktop Type ────────────────────────────────────────────────────

const desktopType = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_type",
    title: "Desktop type text",
    description: "Type text at current focus.",
    inputSchema: import_mcpBundle.z.object({
      text: import_mcpBundle.z.string().describe("Text to type")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const escaped = escapeSendKeys(params.text);
    const script = `

[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
Write-Output "Typed text"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Type failed: ${result.error}`);
    response.addTextResult(`Typed ${params.text.length} characters`);
  }
});

// ── Desktop Key Press ───────────────────────────────────────────────

const desktopKey = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_key",
    title: "Desktop key press",
    description: "Press a key combo (e.g. ctrl+c, alt+tab, f5).",
    inputSchema: import_mcpBundle.z.object({
      key: import_mcpBundle.z.string().describe("Key combo")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const sendKeysStr = keyComboToSendKeys(params.key);
    const script = `

[System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr.replace(/'/g, "''")}')
Write-Output "Pressed ${params.key}"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Key press failed: ${result.error}`);
    response.addTextResult(`Pressed: ${params.key}`);
  }
});

// ── Desktop Mouse Move ──────────────────────────────────────────────

const desktopMouseMove = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_mouse_move",
    title: "Move mouse",
    description: "Move mouse to screen coordinates.",
    inputSchema: import_mcpBundle.z.object({
      x: import_mcpBundle.z.number().describe("X"),
      y: import_mcpBundle.z.number().describe("Y")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const script = `

[Win32Input]::SetCursorPos(${params.x}, ${params.y}) | Out-Null
Write-Output "Moved to (${params.x}, ${params.y})"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Mouse move failed: ${result.error}`);
    response.addTextResult(`Mouse moved to (${params.x}, ${params.y})`);
  }
});

// ── Desktop Scroll ──────────────────────────────────────────────────

const desktopScroll = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_scroll",
    title: "Desktop scroll",
    description: "Scroll mouse wheel.",
    inputSchema: import_mcpBundle.z.object({
      direction: import_mcpBundle.z.enum(["up", "down"]),
      clicks: import_mcpBundle.z.number().default(3),
      x: import_mcpBundle.z.number().optional().describe("X (optional)"),
      y: import_mcpBundle.z.number().optional().describe("Y (optional)")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const amount = (params.direction === "up" ? 1 : -1) * params.clicks * 120;
    const moveCmd = (params.x != null && params.y != null) ? `[Win32Input]::SetCursorPos(${params.x}, ${params.y}) | Out-Null\nStart-Sleep -Milliseconds 50` : "";
    // For negative scroll values, we need to convert to uint32 via bitwise
    const amountExpr = amount < 0 ? `([uint32](0x100000000 + ${amount}))` : `${amount}`;
    const script = `

${moveCmd}
[Win32Input]::mouse_event([Win32Input]::WHEEL, 0, 0, ${amountExpr}, [IntPtr]::Zero)
Write-Output "Scrolled ${params.direction} ${params.clicks} clicks"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Scroll failed: ${result.error}`);
    response.addTextResult(`Scrolled ${params.direction} ${params.clicks} clicks`);
  }
});

// ── Desktop List Windows ────────────────────────────────────────────

const desktopListWindows = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_list_windows",
    title: "List windows",
    description: "List visible windows with PIDs and titles.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const script = `
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
    [PSCustomObject]@{
        PID = $_.Id
        Name = $_.ProcessName
        Title = $_.MainWindowTitle
        Responding = $_.Responding
    }
} | ConvertTo-Json -Depth 2
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`List windows failed: ${result.error}`);

    let windows;
    try {
      windows = JSON.parse(result.output);
      if (!Array.isArray(windows)) windows = [windows];
    } catch (e) {
      windows = [];
    }

    const lines = ["## Open Windows", ""];
    for (const w of windows) {
      const status = w.Responding ? "" : " (NOT RESPONDING)";
      lines.push(`- **[${w.PID}]** ${w.Name}: ${w.Title}${status}`);
    }
    if (windows.length === 0) lines.push("No visible windows found.");
    response.addTextResult(lines.join("\n"));
  }
});

// ── Desktop Focus Window ────────────────────────────────────────────

const desktopFocusWindow = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_focus_window",
    title: "Focus window",
    description: "Focus/minimize/maximize a window by PID or title.",
    inputSchema: import_mcpBundle.z.object({
      pid: import_mcpBundle.z.number().optional().describe("Process ID"),
      title: import_mcpBundle.z.string().optional().describe("Window title (partial match)"),
      action: import_mcpBundle.z.enum(["focus", "minimize", "maximize", "restore"]).default("focus")
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    if (!params.pid && !params.title) throw new Error("Either pid or title must be provided");
    const actionMap = { focus: 5, minimize: 6, maximize: 3, restore: 9 };
    const swCmd = actionMap[params.action] || 5;

    let findCmd;
    if (params.pid) {
      findCmd = `$proc = Get-Process -Id ${params.pid} -ErrorAction Stop`;
    } else {
      const escapedTitle = params.title.replace(/'/g, "''");
      findCmd = `$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${escapedTitle}*' -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $proc) { Write-Error "No window found matching '${escapedTitle}'"; exit 1 }`;
    }

    const script = `

${findCmd}
$hwnd = $proc.MainWindowHandle
[Win32Input]::ShowWindow($hwnd, ${swCmd}) | Out-Null
Start-Sleep -Milliseconds 100
[Win32Input]::SetForegroundWindow($hwnd) | Out-Null
Write-Output "$($proc.ProcessName) - $($proc.MainWindowTitle)"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Focus window failed: ${result.error}`);
    response.addTextResult(`Window ${params.action}: ${result.output}`);
  }
});

// ── Desktop Launch App ──────────────────────────────────────────────

const desktopLaunch = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_launch",
    title: "Launch application",
    description: "Launch an application, file, or URL.",
    inputSchema: import_mcpBundle.z.object({
      command: import_mcpBundle.z.string().describe("App name, path, or URL"),
      args: import_mcpBundle.z.string().optional().describe("Arguments"),
      waitForWindow: import_mcpBundle.z.boolean().default(true)
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const escapedCmd = params.command.replace(/'/g, "''");
    const argsStr = params.args ? ` -ArgumentList '${params.args.replace(/'/g, "''")}'` : "";
    const waitStr = params.waitForWindow ? `\nStart-Sleep -Milliseconds 1500` : "";
    const script = `
$proc = Start-Process -FilePath '${escapedCmd}'${argsStr} -PassThru
${waitStr}
Write-Output "Launched PID: $($proc.Id)"
`;
    const result = runPowerShell(script, 20000);
    if (!result.success) throw new Error(`Launch failed: ${result.error}`);
    response.addTextResult(`Launched: ${params.command} (${result.output})`);
  }
});

// ── Desktop Get Cursor Position ─────────────────────────────────────

const desktopCursorPos = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_cursor_position",
    title: "Get cursor position",
    description: "Get current cursor position.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const script = `

$point = New-Object Win32Input+POINT
[Win32Input]::GetCursorPos([ref]$point) | Out-Null
Write-Output "$($point.X),$($point.Y)"
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`Get cursor position failed: ${result.error}`);
    const [x, y] = result.output.split(",");
    response.addTextResult(`Cursor position: (${x}, ${y})`);
  }
});

// ── Desktop List Monitors ───────────────────────────────────────────

const desktopListMonitors = (0, import_tool.defineTool)({
  capability: "core",
  schema: {
    name: "desktop_list_monitors",
    title: "List monitors",
    description: "List all connected monitors with resolution and position.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const script = `

$screens = [System.Windows.Forms.Screen]::AllScreens
for ($i = 0; $i -lt $screens.Length; $i++) {
  $s = $screens[$i]
  $p = ""
  if ($s.Primary) { $p = " (primary)" }
  $num = $i + 1
  Write-Output ("$num" + $p + ": " + $s.Bounds.Width + "x" + $s.Bounds.Height + " at (" + $s.Bounds.X + "," + $s.Bounds.Y + ") " + $s.DeviceName)
}
`;
    const result = runPowerShell(script);
    if (!result.success) throw new Error(`List monitors failed: ${result.error}`);
    response.addTextResult(`## Monitors\n${result.output}`);
  }
});

var desktop_default = [
  desktopScreenshot,
  desktopClick,
  desktopType,
  desktopKey,
  desktopMouseMove,
  desktopScroll,
  desktopListWindows,
  desktopFocusWindow,
  desktopLaunch,
  desktopCursorPos,
  desktopListMonitors
];
