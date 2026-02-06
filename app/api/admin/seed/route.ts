import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongo';

export async function GET(request: Request) {
    try {
        const db = await getDb();
        const collection = db.collection('server_configurations');

        // Check if config exists
        const existingConfig = await collection.findOne({ key: 'gemini_default_model' });

        // Upsert: Only set value if it doesn't exist ($setOnInsert)
        // If it exists, we just update the 'updatedAt' timestamp or do nothing?
        // Actually, $setOnInsert is only for inserts.
        // If we want to strictly "seed if missing", upsert is perfect.
        const result = await collection.updateOne(
            { key: 'gemini_default_model' },
            {
                $setOnInsert: {
                    key: 'gemini_default_model',
                    value: 'gemini-1.5-flash',
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        // Seed Feature Prompts
        const promptsCollection = db.collection('feature_prompts');
        const visionPrompt = {
            feature_key: 'vision',
            name: 'Project Vision', // User requested $set on name too
            system_prompt: `You are an expert Software Architect and Product Manager. 
Your goal is to refine the user's initial project ideas into a clear, compelling Project Vision.
Analyze the provided 'Purpose' and 'Problem Statement'.
Output a structured response containing:
1. **Refined Vision Statement**: A concise, inspiring summary.
2. **Core Objectives**: Bullet points of what the project aims to achieve.
3. **Target Audience Analysis**: Who benefits and why.
4. **Success Criteria**: Measurable goals.

Keep the tone professional yet innovative.`,
            user_template: `Project Purpose: {{purpose}}
Problem Statement: {{problem_statement}}

Based on the above, generate the Project Vision.`
        };

        const promptResult = await promptsCollection.updateOne(
            { feature_key: 'vision' },
            {
                $set: {
                    name: visionPrompt.name,
                    system_prompt: visionPrompt.system_prompt,
                    user_template: visionPrompt.user_template,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        return NextResponse.json({
            message: 'Seeding complete',
            didUpsertConfig: result.upsertedCount > 0,
            didUpsertPrompts: promptResult.upsertedCount > 0 || promptResult.modifiedCount > 0,
            matches: result.matchedCount + promptResult.matchedCount
        });

    } catch (error) {
        console.error('Seeding Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
