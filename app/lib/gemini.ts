import { GoogleGenAI } from "@google/genai";
import { getDb } from "./mongo";
import { decryptApiKey } from "./encryption";

declare global {
    var _geminiCache: Map<string, GoogleGenAI>;
}

if (!globalThis._geminiCache) {
    globalThis._geminiCache = new Map();
}

export class GeminiManager {
    private static async getClient(userId: string) {
        const db = await getDb();
        const user = await db.collection('users').findOne({ _id: userId as any }); // Cast if needed or use ObjectId

        if (!user || !user.geminiApiKey) {
            throw new Error("Gemini API Key not found for user");
        }

        const serverKey = process.env.ENCRYPTION_KEY!;
        const apiKey = await decryptApiKey(user.geminiApiKey, serverKey, user.salt);

        // Define a global cache key for the user's client
        const cacheKey = `gemini_${userId}`;
        if (!(globalThis as any)._geminiCache) {
            (globalThis as any)._geminiCache = new Map();
        }

        if (!(globalThis as any)._geminiCache.has(cacheKey)) {
            // New SDK Initialization
            const ai = new GoogleGenAI({ apiKey });
            (globalThis as any)._geminiCache.set(cacheKey, ai);
        }

        return (globalThis as any)._geminiCache.get(cacheKey);
    }

    static async generateContent(userId: string, prompt: string, systemInstruction?: string) {
        const client = await this.getClient(userId);
        const db = await getDb();

        // Fetch model config
        const config = await db.collection('server_configurations').findOne({ key: 'gemini_default_model' });
        const modelName = config?.value || 'gemini-1.5-flash';

        try {
            const response = await client.models.generateContent({
                model: modelName,
                config: systemInstruction ? { systemInstruction: systemInstruction } : undefined,
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }]
                    }
                ]
            });
            // According to user example: console.log(response.text)
            return response.text;

        } catch (error) {
            console.error("Gemini Generation Error:", error);
            throw error;
        }
    }
}
