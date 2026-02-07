import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/app/lib/authHelper';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

async function getUser() {
    return await getAuthPayload();
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
        const { step, user_custom_input } = body;

        // step options: 'identify_actions' | 'map_actions' | 'define_contracts'

        const db = await getDb();
        const project = await db.collection('projects').findOne({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // --- FETCH FEATURE CONTEXT & PROMPTS ---
        const projectFeatures = await db.collection('project_features').find({
            project_id: new ObjectId(projectId),
            feature_key: { $in: ['user_flow', 'rules', 'data_models', 'apis'] } // Fetch 'apis' too for intermediate state
        }).toArray();

        const userFlowFeature = projectFeatures.find(f => f.feature_key === 'user_flow');
        const rulesFeature = projectFeatures.find(f => f.feature_key === 'rules');
        const dataModelsFeature = projectFeatures.find(f => f.feature_key === 'data_models');
        const currentApisFeature = projectFeatures.find(f => f.feature_key === 'apis');

        const { GeminiManager } = await import('@/app/lib/gemini');

        // --- STEP 1: IDENTIFY ACTIONS ---
        if (step === 'identify_actions') {
            const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'apis.actions' });
            if (!promptConfig) return NextResponse.json({ error: 'Missing prompt config' }, { status: 500 });

            const userFlowOutput = userFlowFeature?.generated_output || '';
            const userPrompt = promptConfig.user_template.replace('{{user_flow_output}}', userFlowOutput);

            const actionsOutput = await GeminiManager.generateContent(
                payload.userId,
                userPrompt,
                promptConfig.system_prompt
            );

            // Save intermediate step
            await db.collection('project_features').updateOne(
                { project_id: new ObjectId(projectId), feature_key: 'apis' },
                {
                    $set: {
                        "user_input.debug_actions": actionsOutput,
                        updatedAt: new Date()
                    },
                    $setOnInsert: { createdAt: new Date() }
                },
                { upsert: true }
            );

            return NextResponse.json({ message: 'Actions identified', data: actionsOutput });
        }

        // --- STEP 2: MAP ACTIONS ---
        if (step === 'map_actions') {
            const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'apis.action_mapping' });
            if (!promptConfig) return NextResponse.json({ error: 'Missing prompt config' }, { status: 500 });

            // We need the output from Step 1
            const actionsOutput = currentApisFeature?.user_input?.debug_actions;
            if (!actionsOutput) return NextResponse.json({ error: 'Step 1 (Actions) must be run first' }, { status: 400 });

            const dataModelsOutput = dataModelsFeature?.generated_output || '';
            const userPrompt = promptConfig.user_template
                .replace('{{actions_output}}', actionsOutput) // Input is String (JSON)
                .replace('{{data_models_output}}', dataModelsOutput);

            const mappingsOutput = await GeminiManager.generateContent(
                payload.userId,
                userPrompt,
                promptConfig.system_prompt
            );

            // Save intermediate step
            await db.collection('project_features').updateOne(
                { project_id: new ObjectId(projectId), feature_key: 'apis' },
                { $set: { "user_input.debug_mappings": mappingsOutput, updatedAt: new Date() } }
            );

            return NextResponse.json({ message: 'Actions mapped', data: mappingsOutput });
        }

        // --- STEP 3: DEFINE CONTRACTS ---
        if (step === 'define_contracts') {
            const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'apis.contracts' });
            if (!promptConfig) return NextResponse.json({ error: 'Missing prompt config' }, { status: 500 });

            // We need output from Step 2
            const mappingsOutput = currentApisFeature?.user_input?.debug_mappings;
            if (!mappingsOutput) return NextResponse.json({ error: 'Step 2 (Mappings) must be run first' }, { status: 400 });

            // Parse mappings to chunk them
            let allMappings: any[] = [];
            try {
                const cleanJson = mappingsOutput.replace(/```json\n?|\n?```/g, '').trim();
                const parsed = JSON.parse(cleanJson);
                allMappings = parsed.mappings || [];
            } catch (e) {
                console.error("Failed to parse mappings for batching", e);
                return NextResponse.json({ error: 'Failed to parse mappings' }, { status: 500 });
            }

            const BATCH_SIZE = 10;
            const chunks = [];
            for (let i = 0; i < allMappings.length; i += BATCH_SIZE) {
                chunks.push(allMappings.slice(i, i + BATCH_SIZE));
            }

            const rulesOutput = rulesFeature?.generated_output || '';
            let combinedApis: any[] = [];

            // Process batches
            for (const [index, chunk] of chunks.entries()) {
                const chunkJson = JSON.stringify({ mappings: chunk }, null, 2);

                let userPrompt = promptConfig.user_template
                    .replace('{{mappings_output}}', chunkJson)
                    .replace('{{rules_output}}', rulesOutput);

                if (user_custom_input) {
                    userPrompt += `\n\nAdditional User Constraints:\n${user_custom_input}`;
                }

                try {
                    const chunkResult = await GeminiManager.generateContent(
                        payload.userId,
                        userPrompt,
                        promptConfig.system_prompt
                    );

                    const cleanResult = chunkResult.replace(/```json\n?|\n?```/g, '').trim();
                    const parsedResult = JSON.parse(cleanResult);
                    if (parsedResult.apis && Array.isArray(parsedResult.apis)) {
                        combinedApis = [...combinedApis, ...parsedResult.apis];
                    }
                } catch (e) {
                    console.error(`Batch ${index + 1} failed`, e);
                    // Continue to next batch or fail? 
                    // For now, we continue and accept partial results, but ideally we might want to retry.
                }
            }

            const finalContractsOutput = JSON.stringify({ apis: combinedApis }, null, 2);

            // Save Final Result
            await db.collection('project_features').updateOne(
                { project_id: new ObjectId(projectId), feature_key: 'apis' },
                {
                    $set: {
                        generated_output: finalContractsOutput,
                        "user_input.user_custom_input": user_custom_input,
                        updatedAt: new Date()
                    },
                    $inc: { refactored_version: 1 }
                }
            );

            // Mark Complete
            await db.collection('project_modes').updateOne(
                { project_id: new ObjectId(projectId) },
                {
                    $set: {
                        "features.apis.status": "COMPLETED",
                        "features.apis.updatedAt": new Date(),
                        "features.execute_coding.status": "IN_PROGRESS"
                    }
                }
            );

            // Return full feature data including version
            const finalFeature = await db.collection('project_features').findOne({ project_id: new ObjectId(projectId), feature_key: 'apis' });

            return NextResponse.json({
                message: 'Contracts defined',
                data: {
                    generated_output: finalContractsOutput,
                    refactored_version: finalFeature?.refactored_version
                }
            });
        }

        return NextResponse.json({ error: 'Invalid step' }, { status: 400 });

    } catch (error: any) {
        console.error('API Steps error:', error);

        // Handle Quota/Rate Limit Errors
        if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded')) {
            return NextResponse.json({
                error: 'AI Quota Exceeded. You have hit the free tier limit. Please wait a minute and try again.'
            }, { status: 429 });
        }

        // Handle Overloaded Errors
        if (error?.status === 503 || error?.message?.includes('overloaded')) {
            return NextResponse.json({
                error: 'The AI model is currently overloaded. Please try again in a moment.'
            }, { status: 503 });
        }

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
        const feature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'apis'
        });

        return NextResponse.json({
            data: feature ? {
                ...feature.user_input,
                generated_output: feature.generated_output,
                refactored_version: feature.refactored_version
            } : {}
        });

    } catch (error) {
        console.error('Get APIs error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
