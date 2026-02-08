
// @ts-ignore
let EventSource = require('eventsource');
// @ts-ignore
if (EventSource.default) EventSource = EventSource.default;

// @ts-ignore
const fetch = require('node-fetch');
const { signToken } = require('../app/lib/jwt');

const BASE_URL = 'http://localhost:3000';
const SSE_URL = `${BASE_URL}/api/mcp/sse`;

async function run() {
    console.log("--- Starting MCP Connection Debugger ---");

    // A. Generate Token
    const userId = "666666666666666666666666";
    const token = signToken({ userId, email: "debug@test.com" });
    console.log(`[1] Generated Test Token for user ${userId}`);

    // B. Connect to SSE
    const sseUrlWithToken = `${SSE_URL}?token=${token}`;
    console.log(`[2] Connecting to SSE: ${sseUrlWithToken}`);

    try {
        const es = new EventSource(sseUrlWithToken);

        es.onopen = () => {
            console.log("[3] SSE Connection OPEN");
        };

        es.onmessage = (event: any) => {
            console.log(`[SSE MESSAGE] Type: ${event.type}, Data: ${event.data}`);
        };

        es.addEventListener('endpoint', async (event: any) => {
            console.log(`[4] Received 'endpoint' event: ${event.data}`);

            const endpointRaw = event.data;
            const postUrl = endpointRaw.startsWith('http') ? endpointRaw : `${BASE_URL}${endpointRaw}`;
            console.log(`[5] Preparing to POST 'initialize' to: ${postUrl}`);

            // C. Send Initialize Request
            const initMessage = {
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                        name: "debug-script",
                        version: "1.0.0"
                    }
                }
            };

            try {
                const response = await fetch(postUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(initMessage)
                });

                console.log(`[6] POST Response Status: ${response.status}`);
                const text = await response.text();
                console.log(`[6] POST Response Body: ${text}`);

                if (response.status === 200 || response.status === 202) {
                    console.log("[7] Initialization request sent successfully. Waiting for SSE response...");
                }

            } catch (err) {
                console.error("[ERROR] POST Failed:", err);
            }
        });

        es.onerror = (err: any) => {
            console.error("[ERROR] SSE Connection Error:", err);
        };

    } catch (e) {
        console.error("Setup Error", e);
    }

    // Keep alive for a bit
    setTimeout(() => {
        console.log("--- Timeout reached, closing ---");
        process.exit(0);
    }, 10000);
}

run().catch(console.error);
