
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { getDb } from "./mongo";
import { ObjectId } from "mongodb";

// --- MCP Server Logic ---

/**
 * Creates and configures the MCP Server instance.
 * We export a function to ensure a fresh instance or singleton usage.
 */
export const createMcpServer = (userId: string) => {
    const server = new McpServer({
        name: "PromptSmith",
        version: "1.0.0"
    });

    const userObjectId = new ObjectId(userId);

    // --- TOOLS ---

    // 1. List Projects
    server.tool(
        "list_projects",
        "List all projects for the authenticated user.",
        {
            limit: z.number().optional().default(10).describe("Max number of projects to return."),
            page: z.number().optional().default(1).describe("Page number for pagination.")
        },
        async ({ limit, page }) => {
            const db = await getDb();
            const skip = (page - 1) * limit;

            const projects = await db.collection('projects')
                .find({ createdBy: userObjectId })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(projects.map(p => ({
                        id: p._id,
                        name: p.name,
                        status: p.status,
                        mode: p.mode_name,
                        updatedAt: p.updatedAt
                    })), null, 2)
                }]
            };
        }
    );

    // 2. Get Project Context
    server.tool(
        "get_project_context",
        "Fetch the full context of a project including vision, features, and tech choices.",
        {
            projectId: z.string().describe("The ID of the project to fetch context for.")
        },
        async ({ projectId }) => {
            const db = await getDb();
            if (!ObjectId.isValid(projectId)) {
                return { content: [{ type: "text", text: "Invalid Project ID" }], isError: true };
            }

            const project = await db.collection('projects').findOne({
                _id: new ObjectId(projectId),
                createdBy: userObjectId
            });

            if (!project) {
                return { content: [{ type: "text", text: "Project not found or unauthorized access." }], isError: true };
            }

            const features = await db.collection('project_features').find({ project_id: new ObjectId(projectId) }).toArray();

            const fullContext = {
                project: project,
                features: features.reduce((acc: any, f) => {
                    if (f.generated_output) acc[f.feature_key] = f.generated_output;
                    if (f.user_input) acc[f.feature_key + "_input"] = f.user_input;
                    return acc;
                }, {})
            };

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(fullContext, null, 2)
                }]
            };
        }
    );

    // 3. Get Pending Tasks
    server.tool(
        "get_pending_tasks",
        "Fetch a list of pending coding tasks for a specific project.",
        {
            projectId: z.string().describe("The ID of the project to fetch tasks for."),
            limit: z.number().optional().default(10).describe("Max number of tasks to return."),
            reset: z.boolean().optional().default(false).describe("If true, resets ALL coding tasks to PENDING before fetching. Use this to restart the project build.")
        },
        async ({ projectId, limit, reset }) => {
            const db = await getDb();
            if (!ObjectId.isValid(projectId)) {
                return { content: [{ type: "text", text: "Invalid Project ID" }], isError: true };
            }

            // Verify project belongs to user
            const project = await db.collection('projects').findOne({
                _id: new ObjectId(projectId),
                createdBy: userObjectId
            });

            if (!project) {
                return { content: [{ type: "text", text: "Project not found or unauthorized access." }], isError: true };
            }

            // OPTIONAL: Reset all tasks if requested
            if (reset) {
                await db.collection('generated_prompts').updateMany(
                    { project_id: new ObjectId(projectId), status: { $ne: 'PENDING' } },
                    { $set: { status: 'PENDING', updatedAt: new Date() } }
                );
            }

            const tasks = await db.collection('generated_prompts')
                .find({
                    project_id: new ObjectId(projectId),
                    status: { $ne: 'COMPLETED' }
                })
                .sort({ sequence: 1 })
                .limit(2) // Get next 2 to see if there's more
                .toArray();

            if (tasks.length === 0) {
                return { content: [{ type: "text", text: "All tasks completed! Now run the project and verify if everything works as expected." }] };
            }

            const currentTask = tasks[0];
            const hasMore = tasks.length > 1;

            let message = `### NEXT ACTION (Sequence: ${currentTask.sequence})\n\n`;
            message += `**Title**: ${currentTask.title}\n\n`;
            message += `**Instructions**:\n1. Read the prompt content from: \`prompt://${currentTask._id}\`\n`;
            message += `2. Execute the task.\n`;
            message += `3. IMPORTANT: When finished, call tool \`mark_task_complete(promptId: "${currentTask._id}", projectId: "${projectId}")\`.\n`;

            if (hasMore) {
                message += `4. Then call \`get_pending_tasks\` again to receive your next assignment.\n`;
            } else {
                message += `4. This is the last task in the current sequence. After completing it, run and verify the project.\n`;
            }

            return {
                content: [{ type: "text", text: message }]
            };
        }
    );

    // 4. Mark Task Complete
    server.tool(
        "mark_task_complete",
        "Mark a specific task (prompt) as completed by its ID.",
        {
            promptId: z.string().describe("The ID of the prompt/task to mark as complete."),
            projectId: z.string().describe("The ID of the project this task belongs to.")
        },
        async ({ promptId, projectId }) => {
            const db = await getDb();
            if (!ObjectId.isValid(promptId) || !ObjectId.isValid(projectId)) {
                return { content: [{ type: "text", text: "Invalid ID(s)" }], isError: true };
            }

            // Verify project belongs to user
            const project = await db.collection('projects').findOne({
                _id: new ObjectId(projectId),
                createdBy: userObjectId
            });

            if (!project) {
                return { content: [{ type: "text", text: "Project not found or unauthorized access." }], isError: true };
            }

            const result = await db.collection('generated_prompts').updateOne(
                { _id: new ObjectId(promptId), project_id: new ObjectId(projectId) },
                { $set: { status: 'COMPLETED', updatedAt: new Date() } }
            );

            if (result.matchedCount === 0) {
                return { content: [{ type: "text", text: "Task not found in this project." }], isError: true };
            }

            return {
                content: [{ type: "text", text: `Task ${promptId} marked as COMPLETED.` }]
            };
        }
    );


    // --- RESOURCES ---

    // 1. List Projects (Resource)
    server.resource(
        "projects",
        "projects://list",
        async (uri) => {
            const db = await getDb();
            const projects = await db.collection('projects').find({ createdBy: userObjectId }).sort({ createdAt: -1 }).toArray();

            return {
                contents: projects.map(p => ({
                    uri: `projects://${p._id}`,
                    text: p.name,
                    mimeType: "application/json"
                }))
            };
        }
    );

    // 2. Read Project (Full Context)
    server.resource(
        "project",
        "projects://{projectId}",
        async (uri, { projectId }: any) => {
            const db = await getDb();
            if (!ObjectId.isValid(projectId)) {
                throw new Error("Invalid Project ID");
            }

            const project = await db.collection('projects').findOne({
                _id: new ObjectId(projectId),
                createdBy: userObjectId
            });
            if (!project) throw new Error("Project not found or unauthorized access.");

            const features = await db.collection('project_features').find({ project_id: new ObjectId(projectId) }).toArray();

            const fullContext = {
                _SYSTEM_INSTRUCTIONS: {
                    description: "META-INSTRUCTIONS FOR AI AGENTS",
                    content: `To build this project, DO NOT hallucinate tasks. You MUST use the provided MCP Tools.\n\n1. Call tool \`get_pending_tasks(projectId: "${projectId}")\` to fetch the official build plan.\n2. Execute the first pending task.\n3. Call tool \`mark_task_complete(promptId: "...", projectId: "${projectId}")\` when done.\n4. Repeat until no tasks remain.`
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

            // Verify project belongs to user
            const project = await db.collection('projects').findOne({
                _id: prompt.project_id,
                createdBy: userObjectId
            });
            if (!project) throw new Error("Unauthorized access to prompt.");

            return {
                contents: [{
                    uri: uri.href,
                    text: prompt.prompt_text,
                    mimeType: "text/plain"
                }]
            };
        }
    )

    return server;
};
