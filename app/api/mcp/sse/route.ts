
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "@/app/lib/mcp";
import { verifyToken } from "@/app/lib/jwt";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
    console.log(`[MCP SSE] POST request received`);
    try {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get("sessionId");
        console.log(`[MCP SSE] sessionId: ${sessionId}`);

        if (!sessionId) {
            console.warn(`[MCP SSE] Missing sessionId in POST`);
            return new Response(JSON.stringify({ error: "Missing sessionId" }), { status: 400, headers: corsHeaders });
        }

        const transport = global.mcpTransports?.get(sessionId);
        if (!transport) {
            console.warn(`[MCP SSE] Session ${sessionId} not found`);
            return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
        }

        const body = await req.json();
        console.log(`[MCP SSE] Handling message for session ${sessionId}`);
        await transport.handleMessage(body);
        return new Response(JSON.stringify({ status: "accepted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error: any) {
        console.error(`[MCP SSE] Error:`, error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
}

export async function GET(req: Request) {
    try {
        // --- AUTHENTICATION CHECK ---
        const url = new URL(req.url);
        const headersList = await headers();
        const authHeader = headersList.get("authorization");
        const tokenToken = url.searchParams.get("token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : tokenToken;
        console.log(`[MCP SSE] GET request. Token found: ${!!token}, Query Token: ${!!tokenToken}`);

        if (!token) {
            console.warn(`[MCP SSE] Unauthorized: Missing Token`);
            return new Response(JSON.stringify({ error: "Unauthorized: Missing Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const decoded = verifyToken(token) as any;

        if (!decoded || !decoded.userId) {
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`[MCP] Authorized connection for user: ${decoded.userId}`);

        const server = createMcpServer(decoded.userId);

        if (!global.mcpTransports) {
            global.mcpTransports = new Map();
        }

        const stream = new TransformStream();
        const writer = stream.writable.getWriter();

        // Mock Node.js ServerResponse for the SDK's SSEServerTransport
        const mockRes = {
            writeHead: (status: number, headers: any) => { },
            write: (chunk: string) => {
                writer.write(new TextEncoder().encode(chunk));
                return true;
            },
            end: () => {
                writer.close();
            },
            on: () => { },
            once: () => { },
            emit: () => { },
            removeListener: () => { },
            setHeader: () => { },
        };

        // @ts-ignore - The SDK types expect http.ServerResponse
        const transport = new SSEServerTransport("/api/mcp/messages", mockRes);

        global.mcpTransports.set(transport.sessionId, transport);

        await server.connect(transport);

        return new Response(stream.readable, {
            headers: {
                ...corsHeaders,
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error: any) {
        console.error("MCP SSE Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
}
