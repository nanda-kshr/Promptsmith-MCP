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
        const model = await GeminiManager.getModel(payload.userId);

        // Check internal property or response to guess model? 
        // GoogleGenerativeAI model object usually has `model` property or similar config.
        // Let's inspect it safely.

        return NextResponse.json({
            message: 'Gemini Adapter Initialized Successfully',
            cached: globalThis._geminiCache.has(payload.userId),
            modelName: (model as any).model // Attempt to read model name
        });

    } catch (error) {
        console.error('Gemini Test Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
