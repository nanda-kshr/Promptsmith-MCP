
import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/app/lib/authHelper';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';

export async function GET() {
    try {
        const payload = await getAuthPayload();

        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = await getDb();
        const usersCollection = db.collection('users');

        // Fetch fresh user data
        const user = await usersCollection.findOne({ _id: new ObjectId(payload.userId) });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get the JWT from the cookie
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        return NextResponse.json({
            name: user.name,
            email: user.email,
            // Return the actual JWT token for MCP usage
            // Legacy 'appApiKey' is replaced by this
            appApiKey: token || "Token Not Found"
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
