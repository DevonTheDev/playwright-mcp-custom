"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_FILE = path.join(os.homedir(), ".playwright-mcp", "crash.log");

function ensureDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(level, source, message, data) {
  ensureDir();
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${source}] ${message}${data ? " | " + JSON.stringify(data).slice(0, 500) : ""}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {}
}

function info(source, message, data) { log("INFO", source, message, data); }
function error(source, message, data) { log("ERROR", source, message, data); }
function warn(source, message, data) { log("WARN", source, message, data); }

// Install global crash handlers
function installGlobalHandlers() {
  process.on("uncaughtException", (err) => {
    error("PROCESS", "uncaughtException", { message: err.message, stack: err.stack?.slice(0, 1000) });
  });
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack?.slice(0, 1000) : undefined;
    error("PROCESS", "unhandledRejection", { message: msg, stack });
  });
  process.on("exit", (code) => {
    info("PROCESS", `exit with code ${code}`);
  });
  info("PROCESS", "Global crash handlers installed");
}

function clearLog() {
  ensureDir();
  try { fs.writeFileSync(LOG_FILE, ""); } catch (e) {}
}

module.exports = { info, error, warn, installGlobalHandlers, clearLog, LOG_FILE };
