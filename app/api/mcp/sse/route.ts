import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "@/app/lib/mcp";
import { verifyToken } from "@/app/lib/jwt";
import { headers } from "next/headers";
import { mcpTransports, mcpUserSessions } from "@/app/lib/mcp_state";

export const dynamic = "force-dynamic";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

export async function DELETE() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
    console.log(`[MCP SSE] POST request received`);
    try {
        const url = new URL(req.url);
        const headersList = await headers();
        const authHeader = headersList.get("authorization");
        const tokenToken = url.searchParams.get("token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : tokenToken;

        let sessionId = url.searchParams.get("sessionId");
        console.log(`[MCP SSE] sessionId from URL: ${sessionId}`);

        if (!sessionId && token) {
            const decoded = verifyToken(token) as any;
            if (decoded?.userId) {
                sessionId = mcpUserSessions.get(decoded.userId) || null;
                console.log(`[MCP SSE] Fallback: Found sessionId ${sessionId} for userId ${decoded.userId}`);
            }
        }

        if (!sessionId) {
            console.warn(`[MCP SSE] Missing sessionId in POST. Full URL: ${req.url}`);
            const bodyPreview = await req.clone().text().catch(() => "N/A");
            console.log(`[MCP SSE] Body preview: ${bodyPreview.slice(0, 100)}`);
            return new Response(JSON.stringify({ error: "Missing sessionId" }), { status: 400, headers: corsHeaders });
        }

        const transport = mcpTransports.get(sessionId);
        if (!transport) {
            console.warn(`[MCP SSE] Session ${sessionId} not found. Active sessions: ${Array.from(mcpTransports.keys())}`);
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
            console.warn(`[MCP SSE] Unauthorized: Invalid Token`);
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`[MCP] Authorized connection for user: ${decoded.userId}`);

        const server = createMcpServer(decoded.userId);

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
        // Point both ends to the same route for simplicity and compatibility
        const transport = new SSEServerTransport("/api/mcp/sse", mockRes);

        mcpTransports.set(transport.sessionId, transport);
        mcpUserSessions.set(decoded.userId, transport.sessionId);
        console.log(`[MCP SSE] Session created: ${transport.sessionId} for user: ${decoded.userId}`);

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
