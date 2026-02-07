
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { getDb } from "./mongo";
import { ObjectId } from "mongodb";

// --- GLOBAL STATE FOR VERCEL ---
// In a serverless environment, this map will be cleared frequently.
// However, for local development (npm run dev) and short-lived sessions, this works.
// In a real production deployment, you'd need a Redis backing or similar.
declare global {
    var mcpTransports: Map<string, SSEServerTransport>;
}

if (!global.mcpTransports) {
    global.mcpTransports = new Map();
}

/**
 * Creates and configures the MCP Server instance.
 * We export a function to ensure a fresh instance or singleton usage.
 */
export const createMcpServer = () => {
    const server = new McpServer({
        name: "PromptSmith",
        version: "1.0.0"
    });

    // --- TOOLS ---

    // 1. Get Pending Tasks
    server.tool(
        "get_pending_tasks",
        "Fetch a list of pending coding tasks for a specific project.",
        {
            projectId: z.string().describe("The ID of the project to fetch tasks for."),
            limit: z.number().optional().default(10).describe("Max number of tasks to return.")
        },
        async ({ projectId, limit }) => {
            const db = await getDb();
            if (!ObjectId.isValid(projectId)) {
                return { content: [{ type: "text", text: "Invalid Project ID" }], isError: true };
            }

            const tasks = await db.collection('generated_prompts')
                .find({
                    project_id: new ObjectId(projectId),
                    status: { $ne: 'COMPLETED' }
                })
                .sort({ sequence: 1 })
                .limit(limit)
                .toArray();

            if (tasks.length === 0) {
                return { content: [{ type: "text", text: "No pending tasks found." }] };
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(tasks.map(t => ({
                            id: t._id,
                            title: t.title,
                            status: t.status,
                            sequence: t.sequence,
                            // Helper URI for the agent to call 'read_resource' or similar if we exposed prompts as resources
                            // But for now, we just give the data needed.
                            prompt_access_uri: `prompt://${t._id}`
                        })), null, 2)
                    }
                ]
            };
        }
    );

    // 2. Mark Task Complete
    server.tool(
        "mark_task_complete",
        "Mark a specific task (prompt) as completed by its ID.",
        {
            promptId: z.string().describe("The ID of the prompt/task to mark as complete.")
        },
        async ({ promptId }) => {
            const db = await getDb();
            if (!ObjectId.isValid(promptId)) {
                return { content: [{ type: "text", text: "Invalid Prompt ID" }], isError: true };
            }

            await db.collection('generated_prompts').updateOne(
                { _id: new ObjectId(promptId) },
                { $set: { status: 'COMPLETED', updatedAt: new Date() } }
            );

            return {
                content: [{ type: "text", text: `Task ${promptId} marked as COMPLETED.` }]
            };
        }
    );


    // --- RESOURCES ---

    // 1. List Projects
    server.resource(
        "projects",
        "projects://list",
        async (uri) => {
            const db = await getDb();
            const projects = await db.collection('projects').find().sort({ createdAt: -1 }).toArray();

            return {
                contents: projects.map(p => ({
                    uri: `projects://${p._id}`,
                    text: p.name, // Or description
                    mimeType: "application/json"
                }))
            };
        }
    );

    // 2. Read Project (Full Context)
    // We match "projects://{projectId}"
    server.resource(
        "project",
        "projects://{projectId}",
        async (uri, { projectId }: any) => {
            const db = await getDb();
            if (!ObjectId.isValid(projectId)) {
                throw new Error("Invalid Project ID");
            }

            const project = await db.collection('projects').findOne({ _id: new ObjectId(projectId) });
            if (!project) throw new Error("Project not found");

            const features = await db.collection('project_features').find({ project_id: new ObjectId(projectId) }).toArray();

            const fullContext = {
                _SYSTEM_INSTRUCTIONS: {
                    description: "META-INSTRUCTIONS FOR AI AGENTS",
                    content: `To build this project, DO NOT hallucinate tasks. You MUST use the provided MCP Tools.\n\n1. Call tool \`get_pending_tasks(projectId: "${projectId}")\` to fetch the official build plan.\n2. Execute the first pending task.\n3. Call tool \`mark_task_complete(promptId: "...")\` when done.\n4. Repeat until no tasks remain.`
                },
                project: project,
                features: features.reduce((acc: any, f) => {
                    if (f.generated_output) acc[f.feature_key] = f.generated_output;
                    if (f.user_input) acc[f.feature_key + "_input"] = f.user_input;
                    return acc;
                }, {})
            };

            return {
                contents: [{
                    uri: uri.href,
                    text: JSON.stringify(fullContext, null, 2),
                    mimeType: "application/json"
                }]
            }
        }
    );

    // 3. Read Prompt Content
    server.resource(
        "prompt",
        "prompt://{promptId}",
        async (uri, { promptId }: any) => {
            const db = await getDb();
            if (!ObjectId.isValid(promptId)) throw new Error("Invalid Prompt ID");

            const prompt = await db.collection('generated_prompts').findOne({ _id: new ObjectId(promptId) });
            if (!prompt) throw new Error("Prompt not found");

            return {
                contents: [{
                    uri: uri.href,
                    text: prompt.prompt_text,
                    mimeType: "text/plain" // Or application/json if it's structured
                }]
            };
        }
    )

    return server;
};
