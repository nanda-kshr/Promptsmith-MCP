
const http = require('http');

const BASE_URL = "http://localhost:3000/api/mcp/sse";
const TOKEN = process.argv[2];

if (!TOKEN) {
    console.error("Usage: node scripts/verify-mcp.js <YOUR_JWT_TOKEN>");
    process.exit(1);
}

async function verify() {
    console.log("1. Testing GET connection (SSE)...");
    const getUrl = `${BASE_URL}?token=${TOKEN}`;

    return new Promise((resolve) => {
        const req = http.get(getUrl, (res) => {
            console.log(`GET Status: ${res.statusCode}`);
            if (res.statusCode !== 200) {
                console.error("GET failed. Check server logs.");
                process.exit(1);
            }

            let sessionId = null;
            res.on('data', (chunk) => {
                const text = chunk.toString();
                // console.log(`Received: ${text.trim()}`);

                if (text.includes("event: endpoint")) {
                    const match = text.match(/sessionId=([^&\s\n]+)/);
                    if (match) {
                        sessionId = match[1];
                        console.log(`✅ Found Session ID: ${sessionId}`);
                        resolve(sessionId);
                    }
                }
            });
        });

        req.on('error', (e) => {
            console.error(`GET Error: ${e.message}`);
            process.exit(1);
        });
    }).then(async (sessionId) => {
        console.log("\n2. Testing POST message...");
        const postData = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                clientInfo: { name: "test-client", version: "1.0.0" },
                protocolVersion: "2025-06-18",
                capabilities: {}
            }
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            }
        };

        const postReq = http.request(`${BASE_URL}?sessionId=${sessionId}`, options, (res) => {
            console.log(`POST Status: ${res.statusCode}`);
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log(`Response: ${body}`);
                if (res.statusCode === 200) {
                    console.log("\n✅ FULL HANDSHAKE SUCCESSFUL!");
                } else {
                    console.error("\n❌ POST FAILED.");
                }
                process.exit(0);
            });
        });

        postReq.on('error', (e) => {
            console.error(`POST Error: ${e.message}`);
            process.exit(1);
        });

        postReq.write(postData);
        postReq.end();
    });
}

verify();
