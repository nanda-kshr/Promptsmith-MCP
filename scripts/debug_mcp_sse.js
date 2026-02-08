const ev = require('eventsource');
const EventSource = ev.EventSource || ev.default || ev;
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
// Actually, let's just use the signToken logic if we can, but since I can't import TS easily in node without ts-node/tsx
// I will just copy the JWT logic briefly or better yet, I will use `tsx` only for the JWT part and print it, then run this script with the token.
// OR, I can try to require the TS file using `tsx`'s register if I run with `node -r tsx/register`.
// Let's try the simplest: Generate a token using a one-liner `npx tsx -e ...` then paste it here?
// No, I want this self contained.
// Let's blindly try to require the TS file, but if that fails, I'll mock a token (but the server verifies it).
// The server uses `jsonwebtoken`.

// jwt already required above or not needed if signToken is self-contained or mocked
// const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Fallback to default from .env if possible

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

const BASE_URL = 'http://localhost:3000';
const SSE_URL = `${BASE_URL}/api/mcp/sse`;

async function run() {
    console.log("--- Starting MCP Connection Debugger (JS) ---");

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

        es.onmessage = (event) => {
            console.log(`[SSE MESSAGE] Type: ${event.type}, Data: ${event.data}`);
        };

        es.addEventListener('endpoint', async (event) => {
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
                // console.log(`[6] POST Response Body: ${text}`);

                if (response.status === 200 || response.status === 202) {
                    console.log("[7] Initialization request sent successfully. Waiting for SSE response...");
                }

            } catch (err) {
                console.error("[ERROR] POST Failed:", err);
            }
        });

        es.onerror = (err) => {
            // console.error("[ERROR] SSE Connection Error:", err);
        };

    } catch (e) {
        console.error("Setup Error", e);
    }

    // Keep alive for a bit
    setTimeout(() => {
        console.log("--- Timeout reached, closing ---");
        process.exit(0);
    }, 15000);
}

run().catch(console.error);
