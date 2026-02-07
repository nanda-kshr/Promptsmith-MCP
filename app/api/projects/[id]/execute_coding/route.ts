import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/app/lib/authHelper';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

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
            if (stage === 'execute_coding.stage3') {
                updateDoc.generated_output = "COMPLETED";
            }

            await db.collection('project_features').updateOne(
                { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
                { $set: updateDoc },
                { upsert: true }
            );
            return NextResponse.json({ message: "Stage Completed" });
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
        // --- SUB-GENERATOR MAPPING ---
        const SUB_GENERATORS: Record<string, string[]> = {
            'execute_coding.check': ['execute_coding.check'],
            'execute_coding.stage1': ['execute_coding.stage1.env'],
            'execute_coding.stage2': ['execute_coding.stage2.structure'],
            'execute_coding.stage3': ['execute_coding.stage3.batch'],
            // Removed Stages 4-7
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
            if (key === 'tech_choices') {
                console.log(`[Debug] Tech Choices Feature Found: ${!!feature}`);
                console.log(`[Debug] Has User Input? ${!!feature?.user_input}`);
                console.log(`[Debug] User Input Keys: ${feature?.user_input ? Object.keys(feature.user_input).join(',') : 'None'}`);
                console.log(`[Debug] Selected Stack: ${feature?.user_input?.selected_stack ? JSON.stringify(feature.user_input.selected_stack) : 'Missing'}`);
            }

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

        // 3. EXECUTION LOGIC
        if (stage === 'execute_coding.stage3') {
            // --- STAGE 3 SPECIAL: BATCH PROCESSING ---
            const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'execute_coding.stage3.batch' });
            if (!promptConfig) throw new Error("Stage 3 Batch Prompt not found");

            // A. Get Input from Stage 2 (Tree)
            // We need to fetch the SAVED prompt for Stage 2 to get the approved tree
            const stage2Prompt = await db.collection('generated_prompts').findOne({
                project_id: new ObjectId(projectId),
                stage: 'execute_coding.stage2',
                type: "CODING"
            });

            if (!stage2Prompt) throw new Error("Stage 2 Skeleton not found. Please run Stage 2 first.");

            // Parse Tree
            const stage1Text = stage2Prompt.prompt_text;
            const jsonStart = stage1Text.indexOf('{');
            const jsonEnd = stage1Text.lastIndexOf('}');

            let structureJson: any = { tree: [] };
            if (jsonStart !== -1 && jsonEnd !== -1) {
                try {
                    const jsonStr = stage1Text.substring(jsonStart, jsonEnd + 1);
                    structureJson = JSON.parse(jsonStr);
                } catch (e) {
                    console.error("Failed to parse Stage 2 JSON", e);
                    throw new Error("Invalid Stage 2 Output. Please regenerate Stage 2.");
                }
            }

            const sortedFiles = flattenFileTree(structureJson.tree || []);

            console.log(`[Stage 3] Processing ${sortedFiles.length} files...`);

            // B. Recursive Batch Generator
            const generateBatch = async (files: any[]): Promise<any[]> => {
                if (files.length === 0) return [];
                const BATCH_SIZE = 5; // Default target

                // If files > BATCH_SIZE, split immediately
                if (files.length > BATCH_SIZE) {
                    const chunk = files.slice(0, BATCH_SIZE);
                    const remaining = files.slice(BATCH_SIZE);
                    return [...(await generateBatch(chunk)), ...(await generateBatch(remaining))];
                }

                // Prepare Input
                const fileInputs = files.map(f => ({
                    path: f.path || f.name,
                    summary: f.summary,
                    dependencies: f.dependencies
                }));

                let userPrompt = promptConfig.user_template.replace('{{files_batch}}', JSON.stringify(fileInputs, null, 2));
                userPrompt = applyContext(userPrompt);

                // IMPORTANT: Also inject context into System Prompt
                const systemPrompt = applyContext(promptConfig.system_prompt);

                try {
                    // Try to generate
                    const aiOutput = await GeminiManager.generateWithRetry(payload.userId, userPrompt, systemPrompt, 1); // Low retry count, prefer splitting

                    if (!aiOutput) throw new Error("No output");

                    const jsonStart = aiOutput.indexOf('{');
                    const jsonEnd = aiOutput.lastIndexOf('}');

                    if (jsonStart === -1 || jsonEnd === -1) throw new Error("Invalid format");

                    const cleanJson = aiOutput.substring(jsonStart, jsonEnd + 1);
                    const parsed = JSON.parse(cleanJson);
                    return parsed.prompts || [];

                } catch (error: any) {
                    const isOverloaded = error?.status === 503 || error?.message?.includes('503');

                    // ON FAIL: Split execution if possible
                    if (isOverloaded && files.length > 1) {
                        console.log(`[Stage 3] Overload on batch of ${files.length}. Splitting...`);
                        const mid = Math.ceil(files.length / 2);
                        const left = files.slice(0, mid);
                        const right = files.slice(mid);
                        return [...(await generateBatch(left)), ...(await generateBatch(right))];
                    }

                    console.error("Batch Failed", error);
                    throw error; // Propagate if can't split or other error
                }
            };

            // execute
            allPrompts = await generateBatch(sortedFiles);

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
                    console.log(`[Debug] Raw System Prompt has tech_stack? ${promptConfig.system_prompt.includes('{{tech_stack}}')}`);
                    console.log(`[Debug] Tech Choices Length: ${getOutput('tech_choices').length}`);

                    const userPrompt = applyContext(promptConfig.user_template);
                    const systemPrompt = applyContext(promptConfig.system_prompt);

                    console.log(`[Debug] Processed System Prompt has tech_stack? ${systemPrompt.includes('{{tech_stack}}')}`);

                    const aiOutput = await GeminiManager.generateWithRetry(payload.userId, userPrompt, systemPrompt) || "";

                    try {
                        const cleanJson = aiOutput.replace(/```json\n?|\n?```/g, '').trim();
                        const parsed = JSON.parse(cleanJson);
                        if (parsed.prompts) allPrompts.push(...parsed.prompts);

                        // Capture Recommended Variables for Stage 1
                        if (generatorKey === 'execute_coding.stage1.env' && parsed.recommended_variables) {
                            await db.collection('project_features').updateOne(
                                { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
                                { $set: { 'recommended_env_vars': parsed.recommended_variables } }
                            );
                        }

                    } catch (e) { console.error("Generator parse error", e); }
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

                finalPromptText += `\n\n---\n\n**🤖 AUTOMATED HANDOFF**:\nGreat job! Your next task is ready.\n\n**INSTRUCTION**: Call the \`mcp.prompts.get\` tool (or equivalent) with the following argument to get your next instructions:\n\n\`\`\`json\n{\n  "name": "prompt://${nextId}"\n}\n\`\`\`\n\n(Task Title: "${nextTitle}")`;
            } else {
                finalPromptText += `\n\n---\n\n**✅ SEQUENCE COMPLETE**:\nAll generated coding tasks for this stage are finished.\n\n**INSTRUCTION**: Now run the project (e.g. \`npm run dev\`), verify the functionality, and **debug** any issues that arise. You have full autonomy to fix bugs now.`;
            }

            return {
                _id: p._id, // USE PRE-GENERATED ID
                project_id: new ObjectId(projectId),
                type: "CODING",
                stage: stage,
                sub_stage: 'generated',
                sequence: idx,
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
            // Cleanup previous prompts for this stage to ensure idempotency (Latest Version Only)
            await db.collection('generated_prompts').deleteMany({
                project_id: new ObjectId(projectId),
                stage: stage,
                type: "CODING"
            });

            // Insert with pre-defined _ids covers it
            await db.collection('generated_prompts').insertMany(formattedPrompts);
        }

        // Save Summary/Status for this stage
        const updateDoc: any = {
            [`stage_status.${stage.replace('.', '_')}`]: "COMPLETED",
            updatedAt: new Date()
        };

        // IF FINAL STAGE, MARK FEATURE AS COMPLETE
        if (stage === 'execute_coding.stage3') {
            updateDoc.generated_output = "COMPLETED"; // Flag for Dashboard Green Tick
        }

        await db.collection('project_features').updateOne(
            { project_id: new ObjectId(projectId), feature_key: 'execute_coding' },
            { $set: updateDoc },
            { upsert: true }
        );

        return NextResponse.json({
            message: 'Prompts generated',
            prompts: formattedPrompts
        });

    } catch (error: any) {
        console.error('Error generating coding prompts:', error);
        // Handle Quota
        if (error?.status === 429 || error?.message?.includes('429')) {
            return NextResponse.json({ error: 'AI Quota Exceeded. Please wait.' }, { status: 429 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


