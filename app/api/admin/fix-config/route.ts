import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongo';
import { encryptApiKey } from '@/app/lib/encryption';

export async function GET() {
    try {
        const db = await getDb();
        const serverKey = process.env.ENCRYPTION_KEY || 'afHIB2324rfaiyu&*F&AEFHUEAHFJ';

        // 1. Fix Server Configuration
        await db.collection('server_configurations').updateOne(
            { key: 'gemini_default_model' },
            { $set: { value: 'gemini-1.5-flash', updatedAt: new Date() } },
            { upsert: true }
        );

        // 2. Fix Users API Key
        const targetKey = 'AIzaSyCljcmPEppFXRfFHtakAXDrZLtGqW4LQvs';
        const usersToFix = ['gemini_real@example.com', 'gemini_tester@example.com'];

        const updates = [];
        for (const email of usersToFix) {
            const user = await db.collection('users').findOne({ email });
            if (user) {
                // Re-encrypt key
                // Note: user.salt should already exist. 
                // If not, we might fail, but existing users should have salt.
                if (user.salt) {
                    const encryptedKey = await encryptApiKey(targetKey, serverKey, user.salt);
                    await db.collection('users').updateOne(
                        { _id: user._id },
                        { $set: { gemini_api_key: encryptedKey } }
                    );
                    updates.push(`Updated key for ${email}`);
                }
            }
        }

        // 3. Clear Global Cache
        const cacheSizeBefore = (globalThis as any)._geminiCache ? (globalThis as any)._geminiCache.size : 0;
        (globalThis as any)._geminiCache = new Map();

        return NextResponse.json({
            message: 'Fixes applied',
            model_update: 'Set to gemini-1.5-flash',
            user_updates: updates,
            cache_cleared: true,
            cache_size_before: cacheSizeBefore
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
