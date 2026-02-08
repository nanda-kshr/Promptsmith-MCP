import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/app/lib/authHelper';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

export const maxDuration = 300; // Allow 5 minutes for generation

async function getUser() {
    return await getAuthPayload();
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const payload = await getUser();
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const projectId = params.id;
        const body = await request.json();
        const db = await getDb();

        // HANDLE STAGE COMPLETION
        if (body.action === 'complete_stage') {
            const { stage } = body;
            if (!stage) return NextResponse.json({ error: "Missing stage" }, { status: 400 });

            const updateDoc: any = {
                [`stage_status.${stage.replace('.', '_')}`]: "COMPLETED",
                updatedAt: new Date()
            };

            // IF FINAL STAGE, MARK FEATURE AS COMPLETE
            if (stage === 'execute_coding.stage7') {
                updateDoc.generated_output = "COMPLETED";
                // Update Project Modes
                await db.collection('project_modes').updateOne(
                    { project_id: new ObjectId(projectId) },
                    { $set: { [`features.execute_coding.status`]: "COMPLETED" } }
                );
            }

            await db.collection('project_features').updateOne(
                { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
                { $set: updateDoc },
                { upsert: true }
            );
            return NextResponse.json({ message: "Stage Completed" });
        }

        // HANDLE RESET (Clear all prompts and restart)
        if (body.action === 'reset') {
            // 1. Delete all CODING prompts
            await db.collection('generated_prompts').deleteMany({
                project_id: new ObjectId(projectId),
                type: "CODING"
            });

            // 2. Set all stages to IN_PROGRESS
            const resetDoc: any = {
                updatedAt: new Date(),
                generated_output: "IN_PROGRESS",
                stage_status: {
                    execute_coding_check: "IN_PROGRESS",
                    execute_coding_stage1: "IN_PROGRESS",
                    execute_coding_stage2: "IN_PROGRESS",
                    execute_coding_stage3: "IN_PROGRESS",
                    execute_coding_stage4: "IN_PROGRESS",
                    execute_coding_stage5: "IN_PROGRESS",
                    execute_coding_stage6: "IN_PROGRESS",
                    execute_coding_stage7: "IN_PROGRESS"
                }
            };

            await db.collection('project_features').updateOne(
                { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
                { $set: resetDoc },
                { upsert: true }
            );

            return NextResponse.json({ message: "Reset successful" });
        }

        // HANDLE PROMPT UPDATE (Existing)
        const { promptId, prompt_text } = body;
        if (!promptId || !prompt_text) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        await db.collection('generated_prompts').updateOne(
            { _id: new ObjectId(promptId), project_id: new ObjectId(projectId) },
            {
                $set: {
                    prompt_text,
                    updatedAt: new Date(),
                    // If manually edited, maybe flip status back to PENDING if it was something else?
                    // For now, keep as is.
                }
            }
        );

        return NextResponse.json({ message: 'Prompt updated' });

    } catch (error) {
        console.error('Update Prompt Error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const payload = await getUser();
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const projectId = params.id;
        const db = await getDb();

        // 1. Fetch Prompts
        const prompts = await db.collection('generated_prompts')
            .find({ project_id: new ObjectId(projectId), type: "CODING" })
            .sort({ createdAt: 1 })
            .toArray();

        // 2. Fetch Stage Status
        const feature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'execute_coding'
        });

        return NextResponse.json({
            prompts,
            stage_status: feature?.stage_status || {}
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// --- HELPER: Flatten JSON Tree to Sorted List ---
function flattenFileTree(tree: any[]): any[] {
    let files: any[] = [];
    const traverse = (nodes: any[]) => {
        for (const node of nodes) {
            if (node.type === 'file') {
                files.push(node);
            } else if (node.children) {
                traverse(node.children);
            }
        }
    };
    traverse(tree);
    // Sort by Order ASC (0, 1, 2...)
    return files.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const payload = await getUser();
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const projectId = params.id;
        if (!ObjectId.isValid(projectId)) {
            return NextResponse.json({ error: 'Invalid Project ID' }, { status: 400 });
        }

        const body = await request.json();
        const { stage, sub_stage_key } = body;

        const db = await getDb();
        const { GeminiManager } = await import('@/app/lib/gemini');

        // --- SUB-GENERATOR MAPPING ---
        const STAGE_ORDER: Record<string, number> = {
            'execute_coding.check': 0,
            'execute_coding.stage1': 10,
            'execute_coding.stage2': 20,
            'execute_coding.stage3': 30,
            'execute_coding.stage4': 40,
            'execute_coding.stage5': 50,
            'execute_coding.stage6': 60,
            'execute_coding.stage7': 70,
        };

        // --- SUB-GENERATOR MAPPING ---

        const SUB_GENERATORS: Record<string, string[]> = {
            'execute_coding.check': ['execute_coding.check'],
            'execute_coding.stage1': ['execute_coding.stage1.env'],
            'execute_coding.stage2': ['execute_coding.stage2.structure'],
            'execute_coding.stage3': ['execute_coding.stage3.batch'],
            'execute_coding.stage4': ['execute_coding.stage4.api_docs'],
            'execute_coding.stage5': ['execute_coding.stage5.structure'],
            'execute_coding.stage6': ['execute_coding.stage6.batch'],
            'execute_coding.stage7': ['execute_coding.stage7'],
            // Stage 8 removed
        };

        // 1. Fetch Full Context
        const projectFeatures = await db.collection('project_features').find({
            project_id: new ObjectId(projectId),
            feature_key: { $in: ['vision', 'rules', 'tech_choices', 'data_models', 'apis', 'execute_coding'] }
        }).toArray();



        const getOutput = (key: string) => {
            const feature = projectFeatures.find(f => f.feature_key === key);
            // Check execute_coding feature -> recommended_env_vars OR check generated_prompts (but recommended_env_vars is safer if saved)
            // Alternatively, we can find the actual saved prompt text for Stage 1 if needed.
            // For now, let's assume recommended_env_vars is accurate OR fetch from prompt history if needed.
            // Simplest: Use 'recommended_env_vars' stored in project_features during Stage 1 generation.

            // SPECIAL CASE: For tech_choices, prefer the USER SELECTED stack over the AI Analysis
            if (key === 'tech_choices' && feature?.user_input?.selected_stack) {
                return JSON.stringify(feature.user_input.selected_stack, null, 2);
            }
            return feature?.generated_output || '';
        };

        // Helper to get Env Vars (Stage 1 Output)
        const getEnvOutput = () => {
            const executeCodingFeature = projectFeatures.find(f => f.feature_key === 'execute_coding');
            return executeCodingFeature?.recommended_env_vars ? JSON.stringify(executeCodingFeature.recommended_env_vars, null, 2) : '';
        };

        // Helper to replace standard context placeholders
        const applyContext = (text: string, subset?: any) => {
            let replaced = text
                .replace('{{vision_output}}', getOutput('vision'))
                .replace('{{rules_output}}', getOutput('rules'))
                .replace('{{tech_stack}}', getOutput('tech_choices'))
                .replace('{{data_models_output}}', getOutput('data_models'))
                .replace('{{apis_output}}', getOutput('apis'))
                .replace('{{env_output}}', getEnvOutput());

            if (subset) {
                replaced = replaced.replace('{{apis_subset}}', JSON.stringify(subset, null, 2));
            }
            return replaced;
        };

        // 2. Determine Generators
        const generators = SUB_GENERATORS[stage] || [];
        if (generators.length === 0) {
            return NextResponse.json({ error: `No generators for stage: ${stage}` }, { status: 400 });
        }

        let allPrompts: any[] = [];

        // 2. Set stage status to IN_PROGRESS
        await db.collection('project_features').updateOne(
            { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
            { $set: { [`stage_status.${stage.replace('.', '_')}`]: "IN_PROGRESS" } }
        );

        // Update Project Mode Status
        await db.collection('project_modes').updateOne(
            { project_id: new ObjectId(projectId) },
            { $set: { [`features.execute_coding.status`]: "IN_PROGRESS" } }
        );

        // 3. EXECUTION LOGIC
        let pagination: any = null;

        if (stage === 'execute_coding.stage3' || stage === 'execute_coding.stage6') {
            const offset = body.offset || 0;
            const limit = body.limit || 5;

            // --- STAGE 3 & 6 SPECIAL: BATCH PROCESSING ---
            const isFrontend = stage === 'execute_coding.stage6';
            const promptKey = isFrontend ? 'execute_coding.stage6.batch' : 'execute_coding.stage3.batch';
            const structureStage = isFrontend ? 'execute_coding.stage5' : 'execute_coding.stage2';

            const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: promptKey });
            if (!promptConfig) throw new Error(`${stage} Batch Prompt not found`);

            // A. Get Input from Structure Stage (2 or 5)
            const structurePrompt = await db.collection('generated_prompts').findOne({
                project_id: new ObjectId(projectId),
                stage: structureStage,
                type: "CODING"
            });

            if (!structurePrompt) throw new Error(`${structureStage} Structure not found. Please run it first.`);

            // Parse Tree
            const stageText = structurePrompt.prompt_text;
            const jsonStart = stageText.indexOf('{');
            const jsonEnd = stageText.lastIndexOf('}');

            let structureJson: any = { tree: [] };
            if (jsonStart !== -1 && jsonEnd !== -1) {
                try {
                    const jsonStr = stageText.substring(jsonStart, jsonEnd + 1);
                    structureJson = JSON.parse(jsonStr);
                } catch (e) {
                    console.error(`Failed to parse ${structureStage} JSON:`, e);
                    throw new Error(`Invalid ${structureStage} Output. Please regenerate.`);
                }
            }



            let sortedFiles = flattenFileTree(structureJson.tree || []);

            // Deterministic Sort
            sortedFiles.sort((a, b) => {
                if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
                return (a.path || a.name || "").localeCompare(b.path || b.name || "");
            });

            const totalFiles = sortedFiles.length;

            // BATCH SLICING
            const filesToProcess = sortedFiles.slice(offset, offset + limit);
            const isComplete = (offset + limit) >= totalFiles;

            console.log(`[${stage}] Processing Batch: ${offset} - ${offset + limit} (Total: ${totalFiles})`);

            pagination = {
                offset,
                limit,
                total: totalFiles,
                nextOffset: offset + limit,
                isComplete
            };

            // B. Generator
            const generateBatch = async (files: any[]): Promise<any[]> => {
                if (files.length === 0) return [];

                console.log(`[${stage}] Generating batch of ${files.length} files: ${files.map((f: any) => f.path || f.name).join(', ')}`);

                // Prepare Input
                const fileInputs = files.map(f => ({
                    path: f.path || f.name,
                    summary: f.summary,
                    dependencies: f.dependencies
                }));

                let userPrompt = promptConfig.user_template.replace('{{files_batch}}', JSON.stringify(fileInputs, null, 2));
                userPrompt = applyContext(userPrompt);
                const systemPrompt = applyContext(promptConfig.system_prompt);

                let aiOutput = "";
                try {
                    aiOutput = await GeminiManager.generateWithRetry(payload.userId, userPrompt, systemPrompt, 1) || "";

                    const jsonStart = aiOutput.indexOf('{');
                    const jsonEnd = aiOutput.lastIndexOf('}');
                    let parsed: any = null;

                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        try {
                            const cleanJson = aiOutput.substring(jsonStart, jsonEnd + 1);
                            parsed = JSON.parse(cleanJson);
                        } catch (e) { console.warn("[Stage 3] Initial Parse Failed", e); }
                    }

                    if (!parsed) {
                        parsed = await GeminiManager.repairJson(payload.userId, aiOutput);
                    }

                    if (!parsed || !parsed.prompts) throw new Error("Failed to parse");

                    console.log(`[${stage}] Batch Output Prompts: ${parsed.prompts.length}. Titles: ${parsed.prompts.map((p: any) => p.title).join(', ')}`);

                    return parsed.prompts || [];

                } catch (error: any) {
                    console.error(`[${stage}] Batch Error`, error);
                    return []; // Fail gracefully for this batch
                }
            };

            // execute
            if (filesToProcess.length > 0) {
                allPrompts = await generateBatch(filesToProcess);
            }

        } else {
            // --- STANDARD LOGIC (Stages 0, 1, 2, 4-8) ---
            for (const generatorKey of generators) {
                const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: generatorKey });
                if (!promptConfig) continue;

                const isApiStage = generatorKey === 'execute_coding.stage6.apis';

                // SPECIAL HANDLING FOR API BATCHING
                if (isApiStage) {
                    // Parse APIs output
                    const apisRaw = getOutput('apis');
                    let apiList = [];
                    try {
                        const parsed = JSON.parse(apisRaw);
                        apiList = parsed.apis || [];
                    } catch (e) { console.error("Failed to parse APIs", e); }

                    // Chunk APIs (e.g. batch of 5)
                    const BATCH_SIZE = 5;
                    for (let i = 0; i < apiList.length; i += BATCH_SIZE) {
                        const batch = apiList.slice(i, i + BATCH_SIZE);
                        let userPrompt = applyContext(promptConfig.user_template, batch);
                        const systemPrompt = applyContext(promptConfig.system_prompt);

                        const aiOutput = await GeminiManager.generateWithRetry(payload.userId, userPrompt, systemPrompt) || "";

                        try {
                            const cleanJson = aiOutput.replace(/```json\n?|\n?```/g, '').trim();
                            const parsed = JSON.parse(cleanJson);
                            if (parsed.prompts) allPrompts.push(...parsed.prompts);
                        } catch (e) { console.error("Batch parse error", e); }
                    }

                } else {

                    // STANDARD SINGLE GENERATOR
                    console.log(`[Debug] Processing ${generatorKey}`);

                    if (generatorKey === 'execute_coding.stage1.env') {
                        console.log("[Stage 1 Debug] System Prompt Ready. Requesting AI...");
                    }




                    const userPrompt = applyContext(promptConfig.user_template);
                    const systemPrompt = applyContext(promptConfig.system_prompt);



                    const aiOutput = await GeminiManager.generateWithRetry(payload.userId, userPrompt, systemPrompt) || "";



                    let parsed: any = null;
                    try {
                        const cleanJson = aiOutput.replace(/```json\n?|\n?```/g, '').trim();
                        parsed = JSON.parse(cleanJson);
                    } catch (e) {
                        console.warn(`[Standard Generator] Initial Parse Failed for ${generatorKey}`, e);
                        // Fallback Repair attempt
                        try {
                            parsed = await GeminiManager.repairJson(payload.userId, aiOutput);
                        } catch (repairErr) {
                            console.error(`[Standard Generator] Repair Failed for ${generatorKey}`, repairErr);
                        }
                    }

                    if (parsed) {
                        if (generatorKey === 'execute_coding.stage2' || generatorKey === 'execute_coding.stage5') {
                            console.log("[Stage 2 Debug] Parsed JSON:\n", JSON.stringify(parsed, null, 2));
                        }

                        if (parsed.prompts) allPrompts.push(...parsed.prompts);

                        // Capture Recommended Variables for Stage 1 (Fix extraction logic)
                        if (generatorKey === 'execute_coding.stage1.env' && parsed.prompts && parsed.prompts.length > 0) {
                            try {
                                const promptEntry = parsed.prompts[0];
                                let promptJson: any = {};

                                if (typeof promptEntry.prompt_text === 'string') {
                                    try {
                                        promptJson = JSON.parse(promptEntry.prompt_text);
                                    } catch (jsonErr) {
                                        // Attempt to clean if markdown present inside string
                                        const clean = promptEntry.prompt_text.replace(/```json\n?|\n?```/g, '').trim();
                                        try { promptJson = JSON.parse(clean); } catch (e) { console.warn("Failed to parse inner prompt json string", e); }
                                    }
                                } else if (typeof promptEntry.prompt_text === 'object') {
                                    // AI returned object directly instead of stringified JSON
                                    promptJson = promptEntry.prompt_text;
                                    // Ensure it's stored as string in DB
                                    promptEntry.prompt_text = JSON.stringify(promptJson, null, 2);
                                }

                                if (promptJson.ENV) {
                                    await db.collection('project_features').updateOne(
                                        { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
                                        { $set: { 'recommended_env_vars': promptJson.ENV } }
                                    );
                                }
                            } catch (envErr) {
                                console.warn("Failed to extract ENV vars from prompt text", envErr);
                            }
                        }
                    }
                }
            }
        }

        // Parse & Save Prompts

        // 1. Pre-generate IDs so we can link them
        const promptsWithIds = allPrompts.map((p: any) => ({
            ...p,
            _id: new ObjectId()
        }));

        const formattedPrompts = promptsWithIds.map((p: any, idx: number) => {
            // 4. SECOND PASS CONTEXT INJECTION (If Batch Generator used placeholders)
            let finalPromptText = p.prompt_text;
            if (stage === 'execute_coding.check') {
                finalPromptText = "Check and if didnt do, do these initially to ensure the codebase is ready to start developing\n\n" + finalPromptText;
            }
            if (stage === 'execute_coding.stage3') {
                finalPromptText = finalPromptText
                    .replace('{{tech_stack}}', getOutput('tech_choices'))
                    .replace('{{rules_output}}', getOutput('rules'))
                    .replace('{{env_output}}', getEnvOutput());
            }

            // APPEND NEXT STEP INSTRUCTION (AGENTIC HANDOFF)
            if (idx < promptsWithIds.length - 1) {
                const nextId = promptsWithIds[idx + 1]._id.toString();
                const nextTitle = promptsWithIds[idx + 1].title;

                finalPromptText += `\n\n---\n\n**🤖 AUTOMATED HANDOFF**:\nGreat job! Your next task is ready.\n\n**INSTRUCTION**: Call the promptsmith mcp with the following argument to get your next instructions:\n\n\`\`\`json\n{\n  "name": "prompt://${nextId}"\n}\n\`\`\`\n\n(Task Title: "${nextTitle}")`;
            } else if (stage === 'execute_coding.stage3') {
                finalPromptText += `\n\n---\n\n**✅ SEQUENCE COMPLETE**:\nAll generated coding tasks for this stage are finished.\n\n**INSTRUCTION**: Now run the project (e.g. \`npm run dev\`), verify the functionality, and **debug** any issues that arise. You have full autonomy to fix bugs now.`;
            }

            return {
                _id: p._id, // USE PRE-GENERATED ID
                project_id: new ObjectId(projectId),
                type: "CODING",
                stage: stage,
                sub_stage: 'generated',
                sequence: (STAGE_ORDER[stage] || 0) * 1000 + idx,
                title: p.title,

                prompt_text: finalPromptText,
                status: "PENDING",
                metadata: {
                    recommended_variables: (stage === 'execute_coding.stage1' && idx === 0) ? "See project_features.recommended_env_vars" : undefined
                },
                createdAt: new Date()
            };
        });

        if (formattedPrompts.length > 0) {
            // Cleanup previous prompts for this stage to ensure idempotency
            // For Stage 3 & 6 (Batching), ONLY clear on the first batch (offset 0)
            const isBatchStage = stage === 'execute_coding.stage3' || stage === 'execute_coding.stage6';
            const shouldClear = !isBatchStage || (body.offset === 0 || !body.offset);

            if (shouldClear) {
                await db.collection('generated_prompts').deleteMany({
                    project_id: new ObjectId(projectId),
                    stage: stage,
                    type: "CODING"
                });
            }

            // Insert with pre-defined _ids covers it
            await db.collection('generated_prompts').insertMany(formattedPrompts);
        }

        // Save Summary/Status for this stage
        const isBatchStage = stage === 'execute_coding.stage3' || stage === 'execute_coding.stage6';
        const isFinalBatch = !isBatchStage || (pagination && pagination.isComplete);

        const updateDoc: any = {
            [`stage_status.${stage.replace('.', '_')}`]: isFinalBatch ? "COMPLETED" : "IN_PROGRESS",
            updatedAt: new Date()
        };

        // IF FINAL STAGE, MARK FEATURE AS COMPLETE
        if (stage === 'execute_coding.stage7') {
            updateDoc.generated_output = "COMPLETED"; // Flag for Dashboard Green Tick

            // Update Project Modes Status
            await db.collection('project_modes').updateOne(
                { project_id: new ObjectId(projectId) },
                { $set: { [`features.execute_coding.status`]: "COMPLETED" } }
            );
        }

        await db.collection('project_features').updateOne(
            { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
            { $set: updateDoc },
            { upsert: true }
        );

        return NextResponse.json({
            message: 'Prompts generated',
            prompts: formattedPrompts,
            pagination
        });

    } catch (error: any) {
        console.error('Error generating coding prompts:', error);
        if (
            error?.message?.includes('API key not valid') ||
            error?.status === 'INVALID_ARGUMENT' ||
            (error?.error && error.error.status === 'INVALID_ARGUMENT') ||
            error?.status === 400
        ) {
            return NextResponse.json({ error: 'Your AI model configuration is invalid. Please check your API Key.' }, { status: 400 });
        }

        // Handle Quota
        if (error?.status === 429 || error?.message?.includes('429')) {
            return NextResponse.json({ error: 'AI Quota Exceeded. Please wait.' }, { status: 429 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


