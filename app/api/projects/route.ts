import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/app/lib/jwt';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);

        if (!payload || typeof payload === 'string' || !payload.userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const body = await request.json();
        const { name, mode_id: modeId } = body;

        if (!name || !modeId) {
            return NextResponse.json({ error: 'Name and Mode ID are required' }, { status: 400 });
        }

        const db = await getDb();

        let modeObjectId;
        if (ObjectId.isValid(modeId)) {
            modeObjectId = new ObjectId(modeId);
        } else {
            const mode = await db.collection('modes').findOne({ name: modeId });
            if (mode) modeObjectId = mode._id;
        }

        if (!modeObjectId) {
            return NextResponse.json({ error: 'Invalid Mode ID' }, { status: 400 });
        }

        const fullMode = await db.collection('modes').findOne({ _id: modeObjectId });
        if (!fullMode) {
            return NextResponse.json({ error: 'Mode not found' }, { status: 404 });
        }

        // Create Project Document
        const newProject = {
            name,
            status: 'Active',
            mode_id: modeObjectId, // Keep reference for static info
            mode_name: fullMode.name, // Cache name for easy listing
            createdBy: new ObjectId(payload.userId),
            createdAt: new Date(),
            updatedAt: new Date(),
            refactored_version: 1
        };

        const projectResult = await db.collection('projects').insertOne(newProject);
        const projectId = projectResult.insertedId;

        // Initialize Project Mode State
        // Map static mode features to dynamic status: Vision -> IN_PROGRESS, Others -> PENDING
        const projectFeatures: Record<string, any> = {};

        if (fullMode.features) {
            Object.keys(fullMode.features).forEach(key => {
                projectFeatures[key] = {
                    status: key === 'vision' ? 'IN_PROGRESS' : 'PENDING',
                    updatedAt: new Date()
                };
            });
        }

        const newProjectMode = {
            project_id: projectId,
            mode_id: modeObjectId,
            features: projectFeatures,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await db.collection('project_modes').insertOne(newProjectMode);

        return NextResponse.json({
            message: 'Project created',
            projectId: projectId
        }, { status: 201 });

    } catch (error) {
        console.error('Create Project error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);

        if (!payload || typeof payload === 'string' || !payload.userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const skip = (page - 1) * limit;

        const db = await getDb();

        const total = await db.collection('projects').countDocuments({ createdBy: new ObjectId(payload.userId) });

        const projects = await db.collection('projects')
            .find({ createdBy: new ObjectId(payload.userId) })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        return NextResponse.json({
            projects,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }, { status: 200 });

    } catch (error) {
        console.error('List Projects error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
