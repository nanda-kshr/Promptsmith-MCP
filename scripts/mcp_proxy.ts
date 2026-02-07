import fetch from 'node-fetch';
import * as readline from 'readline';

const API_URL = "http://localhost:3000/api/mcp";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

/**
 * MCP Stdio Proxy
 * Reads JSON-RPC messages from Stdio, forwards them to the Next.js API,
 * and writes the response back to Stdio.
 */
rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
        const request = JSON.parse(line);

        // Forward to API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            // Send JSON-RPC Error back
            console.log(JSON.stringify({
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32000,
                    message: `Server returned ${response.status}`
                }
            }));
            return;
        }

        const json = await response.json();

        // Write response back to Stdio
        console.log(JSON.stringify(json));

    } catch (error: any) {
        console.error("Proxy Error:", error.message);
    }
});

console.error("MCP Proxy Started, listening on Stdio...");
