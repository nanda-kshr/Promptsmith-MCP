export const runtime = "nodejs";

export async function POST(req: Request) {
    const body = await req.json();

    if (body.method === "prompts/list") {
        return new Response(
            JSON.stringify({
                prompts: [
                    {
                        name: "spec.simple_api.v1",
                        description: "Build a simple REST API"
                    }
                ]
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    }

    if (body.method === "prompts/get") {
        if (body.params?.name === "spec.simple_api.v1") {
            return new Response(
                JSON.stringify({
                    messages: [
                        { role: "system", content: "You are a strict code generator." },
                        { role: "user", content: "Build a REST API with one GET endpoint." }
                    ]
                }),
                { headers: { "Content-Type": "application/json" } }
            );
        }
    }

    return new Response(
        JSON.stringify({ error: "Unknown method" }),
        { status: 400 }
    );
}
