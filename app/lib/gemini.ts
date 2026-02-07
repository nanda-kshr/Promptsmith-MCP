import { GoogleGenAI } from "@google/genai";
import { getDb } from "./mongo";
import { decryptApiKey } from "./encryption";
import { ObjectId } from "mongodb";

declare global {
    var _geminiCache: Map<string, GoogleGenAI>;
}

if (!globalThis._geminiCache) {
    globalThis._geminiCache = new Map();
}

export class GeminiManager {
    public static async getClient(userId: string) {
        const db = await getDb();
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

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

    static async getDefaultModelName() {
        const db = await getDb();
        const config = await db.collection('server_configurations').findOne({ key: 'gemini_default_model' });
        return config?.value || 'gemini-3-flash-preview'; // Default fallback
    }

    static async generateContent(userId: string, prompt: string, systemInstruction?: string) {
        const client = await this.getClient(userId);
        const modelName = await this.getDefaultModelName();

        try {
            console.log("[Gemini] Generating content with system instruction:", systemInstruction);
            console.log("[Gemini] Generating content with prompt:", prompt);
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

    static async generateWithRetry(userId: string, prompt: string, systemInstruction?: string, retries = 2): Promise<string | null> {
        const { optimizePrompt } = await import('./promptOptimizer');
        let currentPrompt = prompt;
        console.log("[Gemini] Generating content with prompt:", currentPrompt);

        for (let i = 0; i <= retries; i++) {
            try {
                return await this.generateContent(userId, currentPrompt, systemInstruction);
            } catch (error: any) {
                const isOverloaded = error?.status === 503 || error?.code === 503 || error?.message?.includes('503') || error?.message?.includes('overloaded');

                if (isOverloaded && i < retries) {
                    console.log(`[Gemini] Overloaded (Attempt ${i + 1}/${retries + 1}). Optimizing prompt and retrying...`);

                    // Shorten/Optimize the prompt for the next attempt
                    currentPrompt = optimizePrompt(currentPrompt);

                    // Exponential Backoff: 1s, 2s, 4s...
                    const delay = Math.pow(2, i) * 1000;
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                // If strictly overloaded and out of retries, or another error
                throw error;
            }
        }
        return null; // Should not reach here
    }
}
