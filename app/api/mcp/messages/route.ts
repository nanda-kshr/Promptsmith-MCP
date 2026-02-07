import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { headers } from "next/headers";
import { verifyToken } from "@/app/lib/jwt";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
    try {
        // --- AUTHENTICATION CHECK ---
        const url = new URL(req.url);
        const headersList = await headers();
        const authHeader = headersList.get("authorization");
        const tokenToken = url.searchParams.get("token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : tokenToken;

        if (!token) {
            return new Response(JSON.stringify({ error: "Unauthorized: Missing Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const sessionId = url.searchParams.get("sessionId");

        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Missing sessionId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const transport = global.mcpTransports?.get(sessionId);

        if (!transport) {
            return new Response(JSON.stringify({ error: "Session not found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const body = await req.json();
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
