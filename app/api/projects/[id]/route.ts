import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/app/lib/jwt';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';

async function getUser(request: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload || typeof payload === 'string' || !payload.userId) return null;

    return payload;
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!ObjectId.isValid(params.id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    try {
        const db = await getDb();
        const project = await db.collection('projects').findOne({
            _id: new ObjectId(params.id),
            createdBy: new ObjectId(user.userId)
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        return NextResponse.json({ project });
    } catch (error) {
        console.error('Get Project error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!ObjectId.isValid(params.id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { name, status } = body;

        const updateDoc: any = { updatedAt: new Date() };
        if (name) updateDoc.name = name;
        if (status) updateDoc.status = status;

        const db = await getDb();
        const result = await db.collection('projects').updateOne(
            { _id: new ObjectId(params.id), createdBy: new ObjectId(user.userId) },
            { $set: updateDoc }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Project updated' });
    } catch (error) {
        console.error('Update Project error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!ObjectId.isValid(params.id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    try {
        const db = await getDb();
        const result = await db.collection('projects').deleteOne({
            _id: new ObjectId(params.id),
            createdBy: new ObjectId(user.userId)
        });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Project deleted' });
    } catch (error) {
        console.error('Delete Project error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
