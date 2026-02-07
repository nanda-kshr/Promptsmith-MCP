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
        const { selected_stack, additional_notes, force_completion } = body;

        const db = await getDb();

        // Ensure project belongs to user
        const project = await db.collection('projects').findOne({
            _id: new ObjectId(projectId),
            createdBy: new ObjectId(payload.userId)
        });

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Fetch Context (Vision & User Flows)
        const projectFeatures = await db.collection('project_features').find({
            project_id: new ObjectId(projectId),
            feature_key: { $in: ['vision', 'user_flow'] }
        }).toArray();

        const visionFeature = projectFeatures.find(f => f.feature_key === 'vision');
        const userFlowFeature = projectFeatures.find(f => f.feature_key === 'user_flow');

        const visionContext = visionFeature?.generated_output || '';
        const userFlowContext = userFlowFeature?.generated_output || '';

        // Fetch Prompt Config
        const promptConfig = await db.collection('feature_prompts').findOne({ feature_key: 'tech_choices' });

        let generatedContent = null;
        if (promptConfig) {
            const systemPrompt = promptConfig.system_prompt;
            let userPrompt = promptConfig.user_template;

            // Replace Variables
            userPrompt = userPrompt.replace('{{vision_output}}', visionContext)
                .replace('{{user_flow_output}}', userFlowContext)
                .replace('{{user_input}}', JSON.stringify(selected_stack, null, 2))
                .replace('{{additional_notes}}', additional_notes || 'None');

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
                feature_key: 'tech_choices'
            },
            {
                $set: {
                    project_id: new ObjectId(projectId),
                    feature_key: 'tech_choices',
                    user_input: {
                        selected_stack,
                        user_notes: additional_notes
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

        // Parse generated content to check for mandatory fixes
        let hasMandatoryFixes = false;
        try {
            if (generatedContent) {
                const cleanJson = generatedContent.replace(/```json\n?|\n?```/g, '').trim();
                const analysis = JSON.parse(cleanJson);
                if (analysis.suggestions && Array.isArray(analysis.suggestions)) {
                    hasMandatoryFixes = analysis.suggestions.some((s: any) => s.type === 'mandatory');
                }
            }
        } catch (e) {
            console.error("Failed to parse AI response for validation", e);
        }

        // Check for Force Completion override
        const forceCompletion = body.force_completion === true;

        // Update Project Mode status
        // Only mark COMPLETED if NO mandatory fixes OR forced
        const isCompleted = !hasMandatoryFixes || forceCompletion;

        const statusUpdate = isCompleted ? {
            "features.tech_choices.status": "COMPLETED",
            "features.tech_choices.updatedAt": new Date(),
            "features.data_models.status": "IN_PROGRESS" // Unlock next step
        } : {
            "features.tech_choices.status": "IN_PROGRESS", // Keep in progress
            "features.tech_choices.updatedAt": new Date()
            // Do NOT unlock data_models
        };

        await db.collection('project_modes').updateOne(
            { project_id: new ObjectId(projectId) },
            { $set: statusUpdate }
        );

        // Fetch updated feature to get version
        const updatedFeature = await db.collection('project_features').findOne({
            project_id: new ObjectId(projectId),
            feature_key: 'tech_choices'
        });

        return NextResponse.json({
            message: 'Tech Choices saved',
            data: {
                selected_stack,
                generated_output: generatedContent,
                refactored_version: updatedFeature?.refactored_version
            }
        });

    } catch (error) {
        console.error('Save Tech Choices error:', error);
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
            feature_key: 'tech_choices'
        });

        return NextResponse.json({
            data: feature ? { ...feature.user_input, generated_output: feature.generated_output, refactored_version: feature.refactored_version } : { selected_stack: {} }
        });

    } catch (error) {
        console.error('Get Tech Choices error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
