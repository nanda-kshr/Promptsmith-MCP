import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/app/lib/mcp";
import { verifyToken } from "@/app/lib/jwt";

export const dynamic = "force-dynamic";

type JwtPayload = {
    userId?: string;
};

declare global {
    var mcpHttpTransports: Map<string, WebStandardStreamableHTTPServerTransport> | undefined;
    var mcpHttpSessionOwners: Map<string, string> | undefined;
}

if (!global.mcpHttpTransports) {
    global.mcpHttpTransports = new Map();
}

if (!global.mcpHttpSessionOwners) {
    global.mcpHttpSessionOwners = new Map();
}

const mcpHttpTransports = global.mcpHttpTransports;
const mcpHttpSessionOwners = global.mcpHttpSessionOwners;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, mcp-session-id, Last-Event-ID",
};

const json = (body: unknown, status = 200) => {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
};

const getTokenFromRequest = (req: Request) => {
    const authHeader = req.headers.get("authorization");
    const queryToken = new URL(req.url).searchParams.get("token");
    return authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : queryToken;
};

const getUserIdFromRequest = (req: Request) => {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const decoded = verifyToken(token) as JwtPayload | null;
    return decoded?.userId ?? null;
};

const getSessionIdFromRequest = (req: Request) => {
    return req.headers.get("mcp-session-id");
};

const createTransportForUser = async (userId: string) => {
    const server = createMcpServer(userId);

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sessionId: string) => {
            mcpHttpTransports.set(sessionId, transport);
            mcpHttpSessionOwners.set(sessionId, userId);
            console.log(`[MCP HTTP] Session created: ${sessionId} for user: ${userId}`);
        },
        onsessionclosed: (sessionId: string) => {
            mcpHttpTransports.delete(sessionId);
            mcpHttpSessionOwners.delete(sessionId);
            console.log(`[MCP HTTP] Session closed: ${sessionId}`);
        },
    });

    await server.connect(transport);

    return transport;
};

const handle = async (req: Request) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
        return json({ error: "Unauthorized: Missing or invalid token" }, 401);
    }

    const sessionId = getSessionIdFromRequest(req);
    let transport: WebStandardStreamableHTTPServerTransport;

    if (sessionId) {
        const owner = mcpHttpSessionOwners.get(sessionId);
        if (owner && owner !== userId) {
            return json({ error: "Session does not belong to current user" }, 403);
        }

        const existing = mcpHttpTransports.get(sessionId);
        if (!existing) {
            return json({ error: "Session not found" }, 404);
        }

        transport = existing;
    } else {
        transport = await createTransportForUser(userId);
    }

    try {
        const response = await transport.handleRequest(req);
        const headers = new Headers(response.headers);

        for (const [key, value] of Object.entries(corsHeaders)) {
            headers.set(key, value);
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch (error: unknown) {
        console.error("[MCP HTTP] Request handling failed:", error);
        return json({ error: "MCP HTTP transport error" }, 500);
    }
};

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

export async function GET(req: Request) {
    return handle(req);
}

export async function POST(req: Request) {
    return handle(req);
}

export async function DELETE(req: Request) {
    return handle(req);
}
