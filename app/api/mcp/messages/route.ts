
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyToken } from "@/app/lib/jwt";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    // --- AUTHENTICATION CHECK ---
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized: Missing Bearer Token" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return NextResponse.json({ error: "Unauthorized: Invalid Token" }, { status: 401 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
        return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const transport = global.mcpTransports?.get(sessionId);

    if (!transport) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    try {
        const body = await req.json();
        await transport.handleMessage(body);

        return NextResponse.json({ status: "accepted" });
    } catch (error: any) {
        console.error("MCP Message Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
