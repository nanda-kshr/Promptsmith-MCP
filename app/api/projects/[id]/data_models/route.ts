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
        const { current_models, user_custom_input } = body;

        const db = await getDb();

        const project = await db.collection('projects').findOne({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Fetch Context
        const projectFeatures = await db.collection('project_features').find({
            project_id: new ObjectId(projectId),
            feature_key: { $in: ['vision', 'user_flow', 'rules'] }
        }).toArray();

        const visionFeature = projectFeatures.find(f => f.feature_key === 'vision');
        const userFlowFeature = projectFeatures.find(f => f.feature_key === 'user_flow');
        const rulesFeature = projectFeatures.find(f => f.feature_key === 'rules');

        const visionContext = visionFeature?.generated_output || '';
        const userFlowContext = userFlowFeature?.generated_output || '';
        const rulesContext = rulesFeature?.generated_output || '';

        // Fetch Prompt Config
        const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'data_models' });

        let generatedContent = null;
        if (promptConfig) {
            const systemPrompt = promptConfig.system_prompt;
            let userPrompt = promptConfig.user_template;

            const existingModelsStr = current_models ? JSON.stringify(current_models, null, 2) : "None";

            userPrompt = userPrompt.replace('{{vision_output}}', visionContext)
                .replace('{{user_flow_output}}', userFlowContext)
                .replace('{{rules_output}}', rulesContext)
                .replace('{{existing_models}}', existingModelsStr)
                .replace('{{user_custom_input}}', user_custom_input || 'None');

            try {
                const { GeminiManager } = await import('@/app/lib/gemini');
                generatedContent = await GeminiManager.generateContent(
                    payload.userId,
                    userPrompt,
                    systemPrompt
                );
            } catch (geminiError: any) {
                console.error('Gemini Generation Error:', geminiError);
                if (geminiError?.status === 503 || geminiError?.message?.includes('overloaded')) {
                    return NextResponse.json({
                        error: 'The AI model is currently overloaded. Please try again in a moment.'
                    }, { status: 503 });
                }
                throw geminiError;
            }
        }

        await db.collection('project_features').updateOne(
            {
                project_id: new ObjectId(projectId),
                feature_key: 'data_models'
            },
            {
                $set: {
                    project_id: new ObjectId(projectId),
                    feature_key: 'data_models',
                    user_input: {
                        current_models,
                        user_custom_input
                    },
                    generated_output: generatedContent,
                    updatedAt: new Date()
                },
                $inc: { refactored_version: 1 },
                $setOnInsert: {
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        // Update Project Mode status
        await db.collection('project_modes').updateOne(
            { project_id: new ObjectId(projectId) },
            {
                $set: {
                    "features.data_models.status": "COMPLETED",
                    "features.data_models.updatedAt": new Date(),
                    "features.apis.status": "IN_PROGRESS" // Unlock next step
                }
            }
        );

        const updatedFeature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'data_models'
        });

        return NextResponse.json({
            message: 'Data Models generated',
            data: {
                generated_output: generatedContent,
                refactored_version: updatedFeature?.refactored_version
            }
        });

    } catch (error) {
        console.error('Save Data Models error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const payload = await getUser();
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const projectId = params.id;
        if (!ObjectId.isValid(projectId)) {
            return NextResponse.json({ error: 'Invalid Project ID' }, { status: 400 });
        }

        const db = await getDb();
        const feature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'data_models'
        });

        return NextResponse.json({
            data: feature ? {
                ...feature.user_input,
                generated_output: feature.generated_output,
                refactored_version: feature.refactored_version
            } : {}
        });

    } catch (error) {
        console.error('Get Data Models error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
