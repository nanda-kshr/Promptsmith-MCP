import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/app/lib/jwt';
import { GeminiManager } from '@/app/lib/gemini';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload || typeof payload === 'string' || !payload.userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Test Gemini Manager
        const client = await GeminiManager.getClient(payload.userId);
        const modelName = await GeminiManager.getDefaultModelName();

        return NextResponse.json({
            message: 'Gemini Adapter Initialized Successfully',
            cached: globalThis._geminiCache.has(`gemini_${payload.userId}`),
            modelName: modelName
        });

    } catch (error: any) {
        console.error('Gemini Test Error:', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
