import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/app/lib/jwt';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

// Helper to validate user and return payload
async function getUser(request: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    const payload = verifyToken(token);
    if (!payload || typeof payload === 'string' || !payload.userId) return null;
    return payload;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const payload = await getUser(request);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const projectId = params.id;
        if (!ObjectId.isValid(projectId)) {
            return NextResponse.json({ error: 'Invalid Project ID' }, { status: 400 });
        }

        const body = await request.json();
        const { purpose, problem_statement } = body;

        const db = await getDb();

        // Ensure project belongs to user
        const project = await db.collection('projects').findOne({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Fetch Prompt Config
        const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'vision' });

        let generatedContent = null;
        if (promptConfig) {
            const systemPrompt = promptConfig.system_prompt;
            let userPrompt = promptConfig.user_template;

            // Replace Variables
            userPrompt = userPrompt.replace('{{purpose}}', purpose)
                .replace('{{problem_statement}}', problem_statement);

            // Generate with Gemini
            const { GeminiManager } = await import('@/app/lib/gemini');
            generatedContent = await GeminiManager.generateContent(
                payload.userId,
                userPrompt, // prompt
                systemPrompt // systemInstruction
            );
        }

        // Upsert Feature Data
        await db.collection('project_features').updateOne(
            {
                project_id: new ObjectId(projectId),
                feature_key: 'vision'
            },
            {
                $set: {
                    project_id: new ObjectId(projectId),
                    feature_key: 'vision',
                    user_input: {
                        purpose,
                        problem_statement
                    },
                    generated_output: generatedContent, // Store generated vision
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    refactored_version: 0
                }
            },
            { upsert: true }
        );

        // Update Project Mode status for this feature to COMPLETED or IN_PROGRESS?
        // Let's mark it as COMPLETED for now to show progress, or maybe keep IN_PROGRESS?
        // User request didn't specify strict status flow, but typically providing input starts the flow.
        // Let's keep it simple: Just save data. Status management might be separate or auto.
        // For now, let's ensure the ProjectMode reflects activity.

        await db.collection('project_modes').updateOne(
            { project_id: new ObjectId(projectId) },
            {
                $set: {
                    "features.vision.status": "COMPLETED", // Mark as done once saved? Or maybe keep IN_PROGRESS until "Next"? 
                    // Let's assume saving Input means this step is done for now.
                    "features.vision.updatedAt": new Date()
                }
            }
        );

        return NextResponse.json({
            message: 'Vision saved',
            data: {
                purpose,
                problem_statement,
                generated_output: generatedContent
            }
        });

    } catch (error) {
        console.error('Save Vision error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const payload = await getUser(request);
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
            feature_key: 'vision'
        });

        return NextResponse.json({
            data: feature ? { ...feature.user_input, generated_output: feature.generated_output } : { purpose: '', problem_statement: '' }
        });

    } catch (error) {
        console.error('Get Vision error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
