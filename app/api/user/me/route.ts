import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/app/lib/jwt';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'crypto';

export async function GET() {
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

        const db = await getDb();
        const usersCollection = db.collection('users');

        // Fetch fresh user data
        const user = await usersCollection.findOne({ _id: new ObjectId(payload.userId) });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        let appApiKey = user.appApiKey;

        // Generate appApiKey if not exists
        if (!appApiKey) {
            const randomPart = randomBytes(24).toString('hex');
            appApiKey = `ps_${randomPart}`;

            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { appApiKey } }
            );
        }

        return NextResponse.json({
            name: user.name,
            email: user.email,
            appApiKey: appApiKey
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
