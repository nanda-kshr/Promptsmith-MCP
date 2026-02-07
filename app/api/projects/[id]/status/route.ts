import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        if (!ObjectId.isValid(params.id)) {
            return NextResponse.json({ isGenerating: false });
        }

        const db = await getDb();

        // Check Execute Coding Feature Status
        const executeFeature = await db.collection('project_features').findOne({
            project_id: new ObjectId(params.id),
            feature_key: 'execute_coding'
        });

        let isGenerating = false;

        if (executeFeature && executeFeature.stage_status) {
            // Check if ANY stage is IN_PROGRESS
            const statuses = Object.values(executeFeature.stage_status);
            if (statuses.includes('IN_PROGRESS')) {
                isGenerating = true;
            }
        }

        return NextResponse.json({ isGenerating });
    } catch (e) {
        console.error("Status Check Error", e);
        return NextResponse.json({ isGenerating: false });
    }
}
