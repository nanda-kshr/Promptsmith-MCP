
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "@/app/lib/mcp";
import { verifyToken } from "@/app/lib/jwt";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        // --- AUTHENTICATION CHECK ---
        const headersList = await headers();
        const authHeader = headersList.get("authorization");

        // Allow if no auth system is enforced yet? No, user asked for it.
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized: Missing Bearer Token" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = verifyToken(token) as any;

        if (!decoded || !decoded.userId) {
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token or UserID" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
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
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error: any) {
        console.error("MCP SSE Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
