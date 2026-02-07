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
        const { user_input } = body;

        const db = await getDb();

        // Ensure project belongs to user
        const project = await db.collection('projects').findOne({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Fetch Vision Data for Context
        const visionFeature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'vision'
        });

        const visionContext = visionFeature?.generated_output || '';
        const purpose = visionFeature?.user_input?.purpose || '';
        const problem_statement = visionFeature?.user_input?.problem_statement || '';

        // Fetch Prompt Config
        const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'user_flow' });

        let generatedContent = null;
        if (promptConfig) {
            const systemPrompt = promptConfig.system_prompt;
            let userPrompt = promptConfig.user_template;

            // Replace Variables
            userPrompt = userPrompt.replace('{{vision_output}}', visionContext)
                .replace('{{user_input}}', user_input);

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
                // Check for 503 or specific error message
                if (geminiError?.status === 503 || geminiError?.message?.includes('overloaded')) {
                    return NextResponse.json({
                        error: 'The AI model is currently overloaded. Please try again in a moment.'
                    }, { status: 503 });
                }
                throw geminiError; // Re-throw other errors to be caught effectively by outer block
            }
        }

        // Upsert Feature Data
        await db.collection('project_features').updateOne(
            {
                project_id: new ObjectId(projectId),
                feature_key: 'user_flow'
            },
            {
                $set: {
                    project_id: new ObjectId(projectId),
                    feature_key: 'user_flow',
                    user_input: {
                        description: user_input
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
                    "features.user_flow.status": "COMPLETED",
                    "features.user_flow.updatedAt": new Date(),
                    "features.tech_choices.status": "IN_PROGRESS" // Unlock next step
                }
            }
        );

        // Fetch updated feature to get version
        const updatedFeature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'user_flow'
        });

        return NextResponse.json({
            message: 'User Flow saved',
            data: {
                user_input,
                generated_output: generatedContent,
                refactored_version: updatedFeature?.refactored_version
            }
        });

    } catch (error) {
        console.error('Save User Flow error:', error);
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
        // Ensure project belongs to user
        const project = await db.collection('projects').countDocuments({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        const feature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'user_flow'
        });

        return NextResponse.json({
            data: feature ? { ...feature.user_input, generated_output: feature.generated_output, refactored_version: feature.refactored_version } : { description: '' }
        });

    } catch (error) {
        console.error('Get User Flow error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
