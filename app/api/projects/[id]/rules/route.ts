import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/app/lib/authHelper';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

// Helper to validate user and return payload
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
        const { current_rules, ignored_rules, user_custom_input } = body;

        const db = await getDb();

        // Ensure project belongs to user
        const project = await db.collection('projects').findOne({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Fetch Context (Vision, User Flows, Tech Choices)
        const projectFeatures = await db.collection('project_features').find({
            project_id: new ObjectId(projectId),
            feature_key: { $in: ['vision', 'user_flow', 'tech_choices'] }
        }).toArray();

        const visionFeature = projectFeatures.find(f => f.feature_key === 'vision');
        const userFlowFeature = projectFeatures.find(f => f.feature_key === 'user_flow');
        const techChoicesFeature = projectFeatures.find(f => f.feature_key === 'tech_choices');

        const visionContext = visionFeature?.generated_output || '';
        const userFlowContext = userFlowFeature?.generated_output || '';

        let techStackContext = '';
        if (techChoicesFeature?.user_input?.selected_stack) {
            techStackContext = JSON.stringify(techChoicesFeature.user_input.selected_stack, null, 2);
            if (techChoicesFeature.user_input.user_notes) {
                techStackContext += `\n\nAdditional Tech Notes: ${techChoicesFeature.user_input.user_notes}`;
            }
        }

        // Fetch Prompt Config
        const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'rules' });

        let generatedContent = null;
        if (promptConfig) {
            const systemPrompt = promptConfig.system_prompt;
            let userPrompt = promptConfig.user_template;

            // Prepare Existing & Ignored Rules Context
            const existingRulesStr = current_rules ? JSON.stringify(current_rules, null, 2) : "None";
            const ignoredRulesStr = ignored_rules ? JSON.stringify(ignored_rules, null, 2) : "None";

            // Replace Variables
            userPrompt = userPrompt.replace('{{vision_output}}', visionContext)
                .replace('{{user_flow_output}}', userFlowContext)
                .replace('{{tech_choices_output}}', techStackContext)
                .replace('{{existing_rules}}', existingRulesStr)
                .replace('{{ignored_rules}}', ignoredRulesStr)
                .replace('{{user_custom_input}}', user_custom_input || 'None');

            // Generate with Gemini
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

        // Upsert Feature Data
        await db.collection('project_features').updateOne(
            {
                project_id: new ObjectId(projectId),
                feature_key: 'rules'
            },
            {
                $set: {
                    project_id: new ObjectId(projectId),
                    feature_key: 'rules',
                    user_input: {
                        current_rules,
                        ignored_rules,
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
                    "features.rules.status": "COMPLETED",
                    "features.rules.updatedAt": new Date(),
                    "features.data_models.status": "IN_PROGRESS" // Unlock next step
                }
            }
        );

        // Fetch updated feature to get version
        const updatedFeature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'rules'
        });

        return NextResponse.json({
            message: 'Rules generated',
            data: {
                generated_output: generatedContent,
                refactored_version: updatedFeature?.refactored_version
            }
        });

    } catch (error) {
        console.error('Save Rules error:', error);
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
            feature_key: 'rules'
        });

        return NextResponse.json({
            data: feature ? {
                ...feature.user_input,
                generated_output: feature.generated_output,
                refactored_version: feature.refactored_version
            } : {}
        });

    } catch (error) {
        console.error('Get Rules error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
