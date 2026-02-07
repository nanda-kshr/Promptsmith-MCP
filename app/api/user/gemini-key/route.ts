import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/app/lib/authHelper';
import { getDb } from '@/app/lib/mongo';
import { encryptApiKey } from '@/app/lib/encryption';
import { ObjectId } from 'mongodb';

export async function PUT(request: Request) {
    try {
        const payload = await getAuthPayload();

        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = payload.userId;

        const { geminiApiKey } = await request.json();

        if (!geminiApiKey || typeof geminiApiKey !== 'string' || geminiApiKey.trim() === '') {
            return NextResponse.json({ error: 'Valid API Key is required' }, { status: 400 });
        }

        const serverKey = process.env.ENCRYPTION_KEY;
        if (!serverKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const db = await getDb();
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

        if (!user || !user.salt) {
            return NextResponse.json({ error: 'User not found or invalid state' }, { status: 404 });
        }

        // Encrypt the new key
        const encryptedKey = await encryptApiKey(geminiApiKey.trim(), serverKey, user.salt);

        // Update in DB
        await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: { geminiApiKey: encryptedKey, updatedAt: new Date() } }
        );

        // Clear the Gemini cache for this user so next call uses new key
        if ((globalThis as any)._geminiCache) {
            (globalThis as any)._geminiCache.delete(`gemini_${userId}`);
        }

        return NextResponse.json({ message: 'Gemini API Key updated successfully' });

    } catch (error) {
        console.error('Update Gemini Key Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
