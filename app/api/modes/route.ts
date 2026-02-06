import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongo';

export async function GET() {
    try {
        const db = await getDb();
        const modes = await db.collection('modes')
            .find({})
            .project({ _id: 1, name: 1 })
            .toArray();

        // Convert _id to string manually if needed, or rely on JSON serialization
        // NextJS usually handles ObjectId fine, but string is safer for frontend
        const safeModes = modes.map(m => ({
            id: m._id.toString(),
            name: m.name
        }));

        return NextResponse.json({ modes: safeModes });
    } catch (error) {
        console.error('List Modes error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
