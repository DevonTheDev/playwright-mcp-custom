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
var websocketMonitor_exports = {};
__export(websocketMonitor_exports, {
  default: () => websocketMonitor_default
});
module.exports = __toCommonJS(websocketMonitor_exports);

var import_mcpBundle = require("playwright-core/lib/mcpBundle");
var import_tool = require("./tool");

// Storage for monitoring state on the context object:
// context._wsMonitor = {
//   cdpSession, connections: Map<requestId, {url, messages[], status}>,
//   maxMessages, urlFilter
// }

// ── WebSocket Monitor Start ─────────────────────────────────────────

const wsMonitorStart = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_ws_start",
    title: "Start WebSocket monitor",
    description: "Start monitoring WebSocket/SSE traffic on current page.",
    inputSchema: import_mcpBundle.z.object({
      maxMessages: import_mcpBundle.z.number().default(500).describe("Max messages to buffer"),
      urlFilter: import_mcpBundle.z.string().optional().describe("URL filter (partial match)")
    }),
    type: "action"
  },
  handle: async (tab, params, response) => {
    if (tab.context._wsMonitor) {
      response.addTextResult("WebSocket monitor is already running. Use browser_ws_stop to stop it first.");
      return;
    }

    const monitor = {
      cdpSession: null,
      connections: new Map(),
      maxMessages: params.maxMessages || 500,
      urlFilter: params.urlFilter || null,
      sseConnections: new Map(),
      startedAt: new Date().toISOString()
    };

    try {
      const cdpSession = await tab.page.context().newCDPSession(tab.page);
      monitor.cdpSession = cdpSession;

      await cdpSession.send("Network.enable");

      // WebSocket events
      cdpSession.on("Network.webSocketCreated", (event) => {
        if (monitor.urlFilter && !event.url.includes(monitor.urlFilter)) return;
        monitor.connections.set(event.requestId, {
          url: event.url,
          type: "websocket",
          status: "connecting",
          messages: [],
          createdAt: new Date().toISOString()
        });
      });

      cdpSession.on("Network.webSocketHandshakeResponseReceived", (event) => {
        const conn = monitor.connections.get(event.requestId);
        if (conn) conn.status = "open";
      });

      cdpSession.on("Network.webSocketFrameReceived", (event) => {
        const conn = monitor.connections.get(event.requestId);
        if (!conn) return;
        if (conn.messages.length >= monitor.maxMessages) {
          conn.messages.shift(); // Ring buffer behavior
        }
        conn.messages.push({
          direction: "received",
          opcode: event.response.opcode,
          data: event.response.payloadData.slice(0, 10000), // Limit per-message size
          timestamp: new Date().toISOString()
        });
      });

      cdpSession.on("Network.webSocketFrameSent", (event) => {
        const conn = monitor.connections.get(event.requestId);
        if (!conn) return;
        if (conn.messages.length >= monitor.maxMessages) {
          conn.messages.shift();
        }
        conn.messages.push({
          direction: "sent",
          opcode: event.response.opcode,
          data: event.response.payloadData.slice(0, 10000),
          timestamp: new Date().toISOString()
        });
      });

      cdpSession.on("Network.webSocketFrameError", (event) => {
        const conn = monitor.connections.get(event.requestId);
        if (conn) {
          conn.messages.push({
            direction: "error",
            data: event.errorMessage,
            timestamp: new Date().toISOString()
          });
        }
      });

      cdpSession.on("Network.webSocketClosed", (event) => {
        const conn = monitor.connections.get(event.requestId);
        if (conn) conn.status = "closed";
      });

      // SSE detection via EventSource (content-type: text/event-stream)
      cdpSession.on("Network.responseReceived", (event) => {
        const contentType = event.response?.headers?.["content-type"] || event.response?.headers?.["Content-Type"] || "";
        if (contentType.includes("text/event-stream")) {
          if (monitor.urlFilter && !event.response.url.includes(monitor.urlFilter)) return;
          monitor.sseConnections.set(event.requestId, {
            url: event.response.url,
            type: "sse",
            status: "open",
            messages: [],
            createdAt: new Date().toISOString()
          });
        }
      });

      cdpSession.on("Network.dataReceived", (event) => {
        const sse = monitor.sseConnections.get(event.requestId);
        if (sse) {
          if (sse.messages.length >= monitor.maxMessages) {
            sse.messages.shift();
          }
          sse.messages.push({
            direction: "received",
            dataLength: event.dataLength,
            timestamp: new Date().toISOString()
          });
        }
      });

      tab.context._wsMonitor = monitor;
      response.addTextResult(`WebSocket/SSE monitor started. Use browser_ws_messages to view traffic, browser_ws_stop to stop.`);
    } catch (e) {
      throw new Error(`Failed to start WebSocket monitor: ${e.message}`);
    }
  }
});

// ── WebSocket Get Messages ──────────────────────────────────────────

const wsGetMessages = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_ws_messages",
    title: "Get WebSocket messages",
    description: "Get captured WebSocket/SSE messages.",
    inputSchema: import_mcpBundle.z.object({
      limit: import_mcpBundle.z.number().default(50).describe("Max messages per connection"),
      connectionUrl: import_mcpBundle.z.string().optional().describe("URL filter"),
      clear: import_mcpBundle.z.boolean().default(false).describe("Clear buffer after reading")
    }),
    type: "readOnly"
  },
  handle: async (tab, params, response) => {
    const monitor = tab.context._wsMonitor;
    if (!monitor) {
      response.addTextResult("No WebSocket monitor is running. Use browser_ws_start first.");
      return;
    }

    const lines = [`## WebSocket/SSE Monitor (since ${monitor.startedAt})`, ""];

    // WebSocket connections
    const allConnections = [...monitor.connections.entries(), ...monitor.sseConnections.entries()];

    if (allConnections.length === 0) {
      lines.push("No WebSocket or SSE connections detected yet.");
      response.addTextResult(lines.join("\n"));
      return;
    }

    for (const [requestId, conn] of allConnections) {
      if (params.connectionUrl && !conn.url.includes(params.connectionUrl)) continue;

      lines.push(`### ${conn.type.toUpperCase()} [${conn.status}] ${conn.url}`);
      lines.push(`Created: ${conn.createdAt} | Messages: ${conn.messages.length}`);
      lines.push("");

      const msgs = conn.messages.slice(-params.limit);
      for (const msg of msgs) {
        const arrow = msg.direction === "sent" ? ">>>" : msg.direction === "error" ? "!!!" : "<<<";
        let preview = msg.data || `(${msg.dataLength} bytes)`;
        if (typeof preview === "string" && preview.length > 200)
          preview = preview.slice(0, 200) + "...";

        // Try to pretty-print JSON
        if (typeof preview === "string" && (preview.startsWith("{") || preview.startsWith("["))) {
          try {
            const parsed = JSON.parse(preview.endsWith("...") ? msg.data.slice(0, 500) : preview);
            preview = JSON.stringify(parsed, null, 2).slice(0, 300);
          } catch (e) {}
        }

        lines.push(`\`${msg.timestamp}\` ${arrow} ${preview}`);
      }
      lines.push("");

      if (params.clear) conn.messages.length = 0;
    }

    response.addTextResult(lines.join("\n"));
  }
});

// ── WebSocket Monitor Stop ──────────────────────────────────────────

const wsMonitorStop = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_ws_stop",
    title: "Stop WebSocket monitor",
    description: "Stop WebSocket/SSE monitor, return summary.",
    inputSchema: import_mcpBundle.z.object({}),
    type: "action"
  },
  handle: async (tab, params, response) => {
    const monitor = tab.context._wsMonitor;
    if (!monitor) {
      response.addTextResult("No WebSocket monitor is running.");
      return;
    }

    // Detach CDP session
    try {
      if (monitor.cdpSession)
        await monitor.cdpSession.detach().catch(() => {});
    } catch (e) {}

    // Summary
    const wsCount = monitor.connections.size;
    const sseCount = monitor.sseConnections.size;
    let totalMessages = 0;
    for (const conn of monitor.connections.values()) totalMessages += conn.messages.length;
    for (const conn of monitor.sseConnections.values()) totalMessages += conn.messages.length;

    tab.context._wsMonitor = null;

    const lines = [
      "## WebSocket/SSE Monitor Stopped",
      "",
      `- WebSocket connections: ${wsCount}`,
      `- SSE connections: ${sseCount}`,
      `- Total messages captured: ${totalMessages}`,
      `- Duration: ${monitor.startedAt} to ${new Date().toISOString()}`
    ];

    response.addTextResult(lines.join("\n"));
  }
});

var websocketMonitor_default = [
  wsMonitorStart,
  wsGetMessages,
  wsMonitorStop
];
