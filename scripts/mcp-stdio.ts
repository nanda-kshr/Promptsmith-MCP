
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    // Dynamic import to ensure dotenv is loaded first
    const { createMcpServer } = await import("../app/lib/mcp");
    // 1. Database Connection (Required for createMcpServer internals usually, 
    // but createMcpServer imports getDb which handles its own connection? 
    // Let's check app/lib/mongo.ts if we can. 
    // Assuming getDb connects lazily, we might be fine.
    // However, we need a Valid User ID to initialize the server.

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("Error: MONGODB_URI is not set in .env");
        process.exit(1);
    }

    // Connect to find a user
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'promptsmith');

    // FETCH THE USER ID
    // We'll take the first user found, or you can hardcode one if you prefer.
    const user = await db.collection('users').findOne({});

    if (!user) {
        console.error("Error: No users found in database. Please sign up in the web UI first.");
        await client.close();
        process.exit(1);
    }

    console.error(`[MCP Stdio] Starting for user: ${user.email} (${user._id})`);

    // Close this client, the app/lib/mongo will open its own
    await client.close();

    // 2. Start MCP Server
    const server = createMcpServer(user._id.toString());
    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.error("[MCP Stdio] Server running on stdio...");
}

run().catch((err) => {
    console.error("[MCP Stdio] Fatal Error:", err);
    process.exit(1);
});
