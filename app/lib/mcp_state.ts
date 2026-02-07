import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

declare global {
    var mcpTransports: Map<string, SSEServerTransport>;
    var mcpUserSessions: Map<string, string>;
}

if (!global.mcpTransports) {
    global.mcpTransports = new Map();
}

if (!global.mcpUserSessions) {
    global.mcpUserSessions = new Map();
}

export const mcpTransports = global.mcpTransports;
export const mcpUserSessions = global.mcpUserSessions;
