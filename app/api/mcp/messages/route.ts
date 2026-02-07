import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { headers } from "next/headers";
import { verifyToken } from "@/app/lib/jwt";
import { mcpTransports } from "@/app/lib/mcp_state";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
    console.log(`[MCP Messages] POST request received`);
    try {
        // --- AUTHENTICATION CHECK ---
        const url = new URL(req.url);
        const headersList = await headers();
        const authHeader = headersList.get("authorization");
        const tokenToken = url.searchParams.get("token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : tokenToken;
        console.log(`[MCP Messages] Token found: ${!!token}, Query Token: ${!!tokenToken}`);

        if (!token) {
            console.warn(`[MCP Messages] Unauthorized: Missing Token`);
            return new Response(JSON.stringify({ error: "Unauthorized: Missing Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            console.warn(`[MCP Messages] Unauthorized: Invalid Token`);
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const sessionId = url.searchParams.get("sessionId");
        console.log(`[MCP Messages] sessionId: ${sessionId}`);

        if (!sessionId) {
            console.warn(`[MCP Messages] Missing sessionId`);
            return new Response(JSON.stringify({ error: "Missing sessionId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const transport = mcpTransports.get(sessionId);

        if (!transport) {
            console.warn(`[MCP Messages] Session ${sessionId} not found`);
            return new Response(JSON.stringify({ error: "Session not found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const body = await req.json();
        console.log(`[MCP Messages] Handling message for session ${sessionId}`);
        await transport.handleMessage(body);

        return new Response(JSON.stringify({ status: "accepted" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    } catch (error: any) {
        console.error("MCP Message Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
}
