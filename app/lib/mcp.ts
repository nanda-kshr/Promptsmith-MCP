
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { getDb } from "./mongo";
import { ObjectId } from "mongodb";
import { promises as fs } from "fs";
import * as path from "path";

type PromptDoc = {
    _id: ObjectId;
    title?: string;
    prompt_text?: string;
    sequence?: number;
    stage?: string;
    feature_key?: string;
};

const inferStageKey = (prompt: PromptDoc) => {
    if (prompt.stage && prompt.stage.trim().length > 0) {
        return prompt.stage;
    }

    const key = prompt.feature_key ?? "";
    if (key === "execute_coding.check") return "execute_coding.check";

    const stageMatch = key.match(/^execute_coding\.stage\d+/);
    if (stageMatch) return stageMatch[0];

    return "execute_coding.unknown";
};

const stageSortWeight = (stage: string) => {
    if (stage === "execute_coding.check") return 0;
    const match = stage.match(/^execute_coding\.stage(\d+)$/);
    if (match) {
        return Number.parseInt(match[1], 10);
    }
    return 999;
};

const shorten = (text: string, max = 650) => {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
};

const getAllStagesPromptContext = async (db: Awaited<ReturnType<typeof getDb>>, projectObjectId: ObjectId) => {
    const prompts = await db.collection('generated_prompts')
        .find({ project_id: projectObjectId, type: 'CODING' })
        .sort({ sequence: 1 })
        .toArray() as unknown as PromptDoc[];

    if (prompts.length === 0) {
        return "";
    }

    const stageMap = new Map<string, PromptDoc[]>();
    for (const prompt of prompts) {
        const stage = inferStageKey(prompt);
        const list = stageMap.get(stage) ?? [];
        list.push(prompt);
        stageMap.set(stage, list);
    }

    const sortedStages = Array.from(stageMap.keys()).sort((a, b) => stageSortWeight(a) - stageSortWeight(b));

    const lines: string[] = [];
    lines.push("### STAGE PROMPT CONTEXT");
    lines.push(`- Total generated coding prompts: ${prompts.length}`);
    lines.push("- Use these as cumulative constraints. Do not contradict earlier stages unless explicitly overridden.");

    for (const stage of sortedStages) {
        const stagePrompts = stageMap.get(stage) ?? [];
        lines.push(`- ${stage}: ${stagePrompts.length} prompt(s)`);

        for (const prompt of stagePrompts.slice(0, 3)) {
            const title = prompt.title?.trim() || "Untitled";
            const seq = prompt.sequence ?? "N/A";
            const text = (prompt.prompt_text ?? "").trim();
            lines.push(`  - [#${seq}] ${title}`);
            if (text.length > 0) {
                lines.push(`    Prompt Snippet: ${shorten(text)}`);
            }
        }

        if (stagePrompts.length > 3) {
            lines.push(`  - ... ${stagePrompts.length - 3} more prompt(s) in this stage`);
        }
    }

    lines.push("");
    return lines.join("\n");
};

const getMediaContextSummary = async (db: Awaited<ReturnType<typeof getDb>>, projectObjectId: ObjectId) => {
    const mediaFeature = await db.collection('project_features').findOne({
        project_id: projectObjectId,
        feature_key: 'media'
    });

    const mediaOutput = typeof mediaFeature?.generated_output === "string" ? mediaFeature.generated_output.trim() : "";
    if (!mediaOutput) return "";

    return [
        "### MEDIA CONTEXT",
        "- Media planning output from project feature `media`:",
        `- ${shorten(mediaOutput, 900)}`,
        ""
    ].join("\n");
};

const getImageFoldersSummary = async () => {
    try {
        const cwd = process.cwd();
        const candidates = [
            "public",
            "public/images",
            "public/media",
            "app/public",
            "assets",
            "static",
            "media",
            "images",
        ];

        const found: string[] = [];
        for (const c of candidates) {
            try {
                const stat = await fs.stat(path.join(cwd, c));
                if (stat && stat.isDirectory()) found.push(c);
            } catch {
                // ignore missing
            }
        }

        const recommended = found.length > 0 ? found : ["public/media", "public/images"];

        const lines: string[] = [];
        lines.push("### IMAGE / MEDIA FOLDERS");
        lines.push("- Detected image/media folders (if any):");
        if (found.length === 0) {
            lines.push("  - None detected. Recommended folders:");
            for (const r of recommended) lines.push(`    - ${r}`);
        } else {
            for (const f of found) lines.push(`  - ${f}`);
        }

        lines.push("- Please store all generated or source images in one of the above folders.");
        lines.push("- Use descriptive filenames and a flat or namespaced subfolder per feature (e.g. media/screenshots/, media/sprites/).");
        lines.push("");
        return lines.join("\n");
    } catch {
        return "";
    }
};

const getPreflightChecksSummary = async () => {
    try {
        const cwd = process.cwd();
        const files = await fs.readdir(cwd);

        const hasPackageJson = files.includes("package.json");
        const hasPyProject = files.includes("pyproject.toml") || files.includes("requirements.txt");
        const hasNodeModules = files.includes("node_modules");
        const hasVenv = files.includes(".venv") || files.includes("venv");
        const lockFiles = files.filter(f => ["yarn.lock", "pnpm-lock.yaml", "package-lock.json"].includes(f));

        const lines: string[] = [];
        lines.push("### PREFLIGHT / 0th STAGE CHECKS");

        if (!hasPackageJson && !hasPyProject) {
            lines.push("- No obvious project manifest found (no package.json, pyproject.toml, or requirements.txt).");
            lines.push("  - If you are creating a Next.js project, run: npx create-next-app@latest my-app");
            lines.push("  - If you are creating a Node project, run: npm init -y");
            lines.push("  - If you are creating a Python project, run: python -m venv .venv && .venv/bin/python -m pip install -r requirements.txt");
        }

        if (hasPackageJson) {
            lines.push(`- Detected package.json in workspace.`);
            if (!hasNodeModules) {
                const pm = lockFiles.includes("pnpm-lock.yaml") ? "pnpm" : lockFiles.includes("yarn.lock") ? "yarn" : "npm";
                const installCmd = pm === "npm" ? "npm install" : pm === "yarn" ? "yarn install" : "pnpm install";
                lines.push(`  - node_modules not found. Run: ${installCmd}`);
            } else {
                lines.push("  - node_modules found. Dependencies appear installed.");
            }
        }

        if (hasPyProject) {
            lines.push(`- Detected Python project files.`);
            if (!hasVenv) {
                lines.push("  - No virtual environment found. Create one with: python -m venv .venv");
                if (files.includes("requirements.txt")) {
                    lines.push("  - Then install: .venv/bin/pip install -r requirements.txt");
                }
            } else {
                lines.push("  - Virtual environment detected. Activate it before running installs.");
            }
        }

        lines.push("- Ensure runtime tools are available: Node.js (>=16), npm/pnpm/yarn for JS projects, Python 3.8+ for Python projects.");
        lines.push("");
        return lines.join("\n");
    } catch {
        return "";
    }
};

const getWorkspaceContextSummary = async () => {
    try {
        const cwd = process.cwd();
        const entries = await fs.readdir(cwd, { withFileTypes: true });

        const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

        const hasAppDir = directories.includes("app");
        const hasPagesDir = directories.includes("pages");
        const hasSrcAppDir = directories.includes("src") && await fs.stat(path.join(cwd, "src", "app")).then((stat) => stat.isDirectory()).catch(() => false);
        const hasSrcPagesDir = directories.includes("src") && await fs.stat(path.join(cwd, "src", "pages")).then((stat) => stat.isDirectory()).catch(() => false);

        let routerGuidance = "Router style is unclear. Detect existing route folders before creating new routes.";
        if ((hasAppDir || hasSrcAppDir) && !(hasPagesDir || hasSrcPagesDir)) {
            routerGuidance = "This workspace uses Next.js App Router. Create routes under app/** (or src/app/**). Do NOT create pages router files (pages/**).";
        } else if ((hasPagesDir || hasSrcPagesDir) && !(hasAppDir || hasSrcAppDir)) {
            routerGuidance = "This workspace uses Next.js Pages Router. Create routes under pages/** (or src/pages/**). Do NOT create app router files (app/**).";
        } else if ((hasAppDir || hasSrcAppDir) && (hasPagesDir || hasSrcPagesDir)) {
            routerGuidance = "Both app and pages routers exist. Follow the existing feature's folder style and do not mix routers for the same feature.";
        }

        const topLevelDirs = directories.sort().slice(0, 20).join(", ") || "None";
        const topLevelFiles = files.sort().slice(0, 20).join(", ") || "None";

        return [
            "### WORKSPACE CONTEXT",
            `- Workspace root: ${cwd}`,
            `- Top-level directories: ${topLevelDirs}`,
            `- Top-level files: ${topLevelFiles}`,
            `- Router guidance: ${routerGuidance}`,
            "- IMPORTANT: Prefer extending existing folders/files over creating parallel structures.",
            ""
        ].join("\n");
    } catch {
        return [
            "### WORKSPACE CONTEXT",
            "- Workspace inspection unavailable.",
            "- IMPORTANT: Inspect existing file structure first and follow current router/style conventions.",
            ""
        ].join("\n");
    }
};

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
            reset: z.boolean().optional().default(false).describe("If true, resets ALL coding tasks to PENDING before fetching. Use this to restart the project build or If this is the first request to get pending tasks.")
        },
        async ({ projectId, limit, reset }) => {
            const db = await getDb();
            if (!ObjectId.isValid(projectId)) {
                return { content: [{ type: "text", text: "Invalid Project ID" }], isError: true };
            }
            const projectObjectId = new ObjectId(projectId);

            // Verify project belongs to user
            const project = await db.collection('projects').findOne({
                _id: projectObjectId,
                createdBy: userObjectId
            });

            if (!project) {
                return { content: [{ type: "text", text: "Project not found or unauthorized access." }], isError: true };
            }

            // OPTIONAL: Reset all tasks if requested
            if (reset) {
                await db.collection('generated_prompts').updateMany(
                    { project_id: projectObjectId, status: { $ne: 'PENDING' } },
                    { $set: { status: 'PENDING', updatedAt: new Date() } }
                );
            }

            const tasks = await db.collection('generated_prompts')
                .find({
                    project_id: projectObjectId,
                    status: { $ne: 'COMPLETED' }
                })
                .sort({ sequence: 1 })
                .limit(2) // Get next 2 to see if there's more
                .toArray();

            if (tasks.length === 0) {
                // Check if ANY tasks exist for this project (to distinguish between completed and not-generated)
                const totalTasks = await db.collection('generated_prompts').countDocuments({
                    project_id: projectObjectId
                });

                if (totalTasks === 0) {
                    return { content: [{ type: "text", text: "No generated tasks found. Please ensure you have run the **Prompt Factory** generation stages in the PromptSmith Dashboard for this project." }] };
                }

                return { content: [{ type: "text", text: "All tasks completed! Now run the project and verify if everything works as expected." }] };
            }

            const currentTask = tasks[0];
            const hasMore = tasks.length > 1;

            const workspaceContext = await getWorkspaceContextSummary();
            const preflightContext = await getPreflightChecksSummary();
            const imageFoldersContext = await getImageFoldersSummary();
            const allStagesPromptContext = await getAllStagesPromptContext(db, projectObjectId);
            const mediaContext = await getMediaContextSummary(db, projectObjectId);

            let message = `### NEXT ACTION (Sequence: ${currentTask.sequence})\n\n`;
            message += `${workspaceContext}`;
            message += `${preflightContext}`;
            message += `${imageFoldersContext}`;
            message += `${allStagesPromptContext}`;
            message += `${mediaContext}`;
            message += `**Title**: ${currentTask.title}\n\n`;
            message += `**Task Content**:\n\`\`\`text\n${currentTask.prompt_text}\n\`\`\`\n\n`;
            message += `**Instructions**:\n1. Execute the task content above.\n`;
            message += `2. Apply workspace, preflight, stage prompt context, and media context while implementing the task.\n`;
            message += `- Store generated or source images in the image/media folders listed above and reference them with relative paths from the workspace root.\n`;
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
                    content: `To build this project, DO NOT hallucinate tasks. You MUST use the provided MCP Tools.\n\n1. Call tool \`get_pending_tasks(projectId: "${projectId}")\` to fetch the official build plan.\n2. Before writing code, inspect existing file structure and follow current framework conventions (for Next.js: do not mix App Router and Pages Router for the same feature).\n3. Execute the first pending task.\n4. Call tool \`mark_task_complete(promptId: "...", projectId: "${projectId}")\` when done.\n5. Repeat until no tasks remain.`
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
