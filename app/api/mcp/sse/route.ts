import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "@/app/lib/mcp";
import { verifyToken } from "@/app/lib/jwt";
import { headers } from "next/headers";
import { mcpTransports, mcpUserSessions } from "@/app/lib/mcp_state";

export const dynamic = "force-dynamic";

const isAbortLikeError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const name = error instanceof Error ? error.name : "";
    return name === "AbortError" || message.includes("ResponseAborted") || message.includes("aborted");
};

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
        console.log(`[MCP SSE] POST request. sessionId from URL: ${sessionId}`);

        if (!sessionId && token) {
            const decoded = verifyToken(token) as any;
            if (decoded?.userId) {
                console.log(`[MCP SSE] Looking up session for userId: ${decoded.userId}`);
                console.log(`[MCP SSE] Current global mcpUserSessions keys: ${Array.from(mcpUserSessions.keys())}`);

                sessionId = mcpUserSessions.get(decoded.userId) || null;

                if (!sessionId) {
                    console.log(`[MCP SSE] Session not found in mcpUserSessions for user ${decoded.userId}. Checking mcpTransports directly.`);
                    // Fallback: If there's only one transport, or we can find one that might belong to this user
                    // In a multi-user environment, this needs to be more robust, but for now:
                    if (mcpTransports.size > 0) {
                        // Check if we can find any session that matches
                        sessionId = Array.from(mcpTransports.keys())[0];
                        console.log(`[MCP SSE] Extreme Fallback: Using first available session ${sessionId}`);
                    }
                }

                if (sessionId) {
                    console.log(`[MCP SSE] Fallback resolved sessionId: ${sessionId}`);
                } else {
                    console.warn(`[MCP SSE] Failed to resolve sessionId for user ${decoded.userId}`);
                }
            } else {
                console.warn(`[MCP SSE] Token provided but no userId found in decoded payload`);
            }
        }

        if (!sessionId) {
            console.warn(`[MCP SSE] Missing sessionId in POST. Full URL: ${req.url}`);
            const bodyPreview = await req.clone().text().catch(() => "N/A");
            console.log(`[MCP SSE] Body preview: ${bodyPreview.slice(0, 500)}`);
            return new Response(JSON.stringify({ error: "Missing sessionId", details: "Could not find an active session for this user." }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
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
    console.log(`[MCP SSE] GET connection attempt. URL: ${req.url}`);
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

        console.log(`[MCP SSE] Authorized connection for user: ${decoded.userId}`);

        const server = createMcpServer(decoded.userId);

        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();
        let closed = false;
        let transport: SSEServerTransport | null = null;

        const cleanup = () => {
            if (!transport) return;
            mcpTransports.delete(transport.sessionId);
            const activeSession = mcpUserSessions.get(decoded.userId);
            if (activeSession === transport.sessionId) {
                mcpUserSessions.delete(decoded.userId);
            }
        };

        // Mock Node.js ServerResponse for the SDK's SSEServerTransport
        const mockRes = {
            writeHead: () => { },
            write: (chunk: string) => {
                if (closed) return true;
                void writer.write(encoder.encode(chunk)).catch((error: unknown) => {
                    if (!isAbortLikeError(error)) {
                        console.error("[MCP SSE] Stream write failed:", error);
                    }
                    if (!closed) {
                        closed = true;
                        cleanup();
                    }
                });
                return true;
            },
            end: () => {
                if (closed) return;
                closed = true;
                cleanup();
                void writer.close().catch((error: unknown) => {
                    if (!isAbortLikeError(error)) {
                        console.error("[MCP SSE] Stream close failed:", error);
                    }
                });
            },
            on: () => { },
            once: () => { },
            emit: () => { },
            removeListener: () => { },
            setHeader: () => { },
        };

        // @ts-expect-error - The SDK types expect http.ServerResponse
        // Point both ends to the same route for simplicity and compatibility
        transport = new SSEServerTransport("/api/mcp/sse", mockRes);

        mcpTransports.set(transport.sessionId, transport);
        mcpUserSessions.set(decoded.userId, transport.sessionId);

        req.signal.addEventListener("abort", () => {
            if (!closed) {
                closed = true;
                void writer.close().catch(() => { });
            }
            cleanup();
            console.log(`[MCP SSE] Connection aborted. Session cleaned: ${transport?.sessionId ?? "unknown"}`);
        }, { once: true });

        console.log(`[MCP SSE] Session created: ${transport.sessionId} for user: ${decoded.userId}`);
        console.log(`[MCP SSE] Current global mcpUserSessions keys: ${Array.from(mcpUserSessions.keys())}`);

        // MANUAL ENDPOINT SEND: Ensure the client receives the endpoint event immediately
        // The SDK's SSEServerTransport tries to do this, but in Next.js App Router streaming,
        // explicit writing ensures it flushes correctly.
        const endpointMessage = `/api/mcp/sse?sessionId=${transport.sessionId}`;
        if (!closed) {
            void writer.write(encoder.encode(`event: endpoint\ndata: ${endpointMessage}\n\n`)).catch((error: unknown) => {
                if (!isAbortLikeError(error)) {
                    console.error("[MCP SSE] Failed to send endpoint event:", error);
                }
            });
        }

        // Do not block the GET response on connect; waiting here can deadlock initialize.
        void server.connect(transport).catch((connectErr: unknown) => {
            if (!isAbortLikeError(connectErr)) {
                console.error("[MCP SSE] server.connect failed:", connectErr);
            }
            if (!closed) {
                closed = true;
                cleanup();
                void writer.close().catch(() => { });
            }
        });

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
