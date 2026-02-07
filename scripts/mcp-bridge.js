
/**
 * MCP Bridge Script
 * 
 * Bridges a standard Stdio MCP Client (like Cursor/Claude) 
 * to a Remote SSE Server (like Vercel/Next.js App Router).
 * 
 * Usage: 
 *   node scripts/mcp-bridge.js [BASE_URL] [AUTH_TOKEN]
 * 
 * Example:
 *   node scripts/mcp-bridge.js http://localhost:3000/api/mcp my-secret-token
 */

const http = require('http');
const https = require('https');
const readline = require('readline');

// Config
const BASE_URL = process.argv[2] || "http://127.0.0.1:3000/api/mcp";
const AUTH_TOKEN = process.argv[3]; // Optional Token

const SSE_URL = `${BASE_URL}/sse`;
const MSG_URL = `${BASE_URL}/messages`;

let sessionId = null;

// Helper for headers
const getHeaders = (contentType = "application/json") => {
    const headers = { "Content-Type": contentType };
    if (AUTH_TOKEN) {
        headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
    }
    return headers;
};

// --- 1. Handling Stdin (Client -> Server) ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // IMPORTANT: Don't output to stdout, as that's reserved for JSON-RPC
    terminal: false
});

rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
        const msg = JSON.parse(line);

        // We need a session ID before sending messages
        if (!sessionId) {
            console.error("[Bridge] Cannot send message: No Session ID yet.");
            return;
        }

        // Send POST to server
        const res = await fetch(`${MSG_URL}?sessionId=${sessionId}`, {
            method: "POST",
            headers: getHeaders("application/json"),
            body: JSON.stringify(msg)
        });

        if (!res.ok) {
            console.error(`[Bridge] Failed to send message: ${res.status}`);
            const err = await res.text();
            console.error(err);
        }
    } catch (e) {
        console.error("[Bridge] Input Error:", e);
    }
});

// --- 2. Handling SSE (Server -> Client) ---
console.error(`[Bridge] Connecting to ${SSE_URL}...`);

async function connectSSE() {
    try {
        const res = await fetch(SSE_URL, {
            headers: getHeaders(null) // Content-Type not needed for GET
        });

        if (!res.ok) {
            throw new Error(`SSE Connect Failed: ${res.status} ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.error("[Bridge] SSE Stream ended.");
                process.exit(0);
            }

            buffer += decoder.decode(value, { stream: true });

            // Process lines
            const lines = buffer.split("\n");
            // Keep the last partial line
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                if (line.startsWith("event: ")) {
                    const type = line.substring(7).trim();
                    currentEventType = type;
                } else if (line.startsWith("data: ")) {
                    const data = line.substring(6).trim();

                    if (currentEventType === "endpoint") {
                        try {
                            const urlStr = data.startsWith("http") ? data : "http://dummy" + data;
                            const url = new URL(urlStr);
                            sessionId = url.searchParams.get("sessionId");
                            console.error(`[Bridge] Connected! Session ID: ${sessionId}`);
                        } catch (e) {
                            console.error("[Bridge] Failed to parse endpoint:", data);
                        }
                    } else if (currentEventType === "message") {
                        console.log(data);
                    } else {
                        console.error(`[Bridge] Unknown event type: ${currentEventType}`);
                    }
                }
            }
        }
    } catch (e) {
        console.error(`[Bridge] SSE Error:`, e);
        setTimeout(connectSSE, 2000); // Retry
    }
}

let currentEventType = "message"; // Default
connectSSE();

// Keep process alive
process.on('SIGINT', () => process.exit(0));
