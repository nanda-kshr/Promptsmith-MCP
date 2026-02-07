import { cookies, headers } from 'next/headers';
import { verifyToken } from './jwt';

export interface AuthPayload {
    userId: string;
}

/**
 * Extract JWT token from Authorization header (Bearer) or cookies.
 * Prioritizes Bearer token if both are present.
 */
export async function getAuthToken(): Promise<string | null> {
    // 1. Check Authorization header first
    const headersList = await headers();
    const authHeader = headersList.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7); // Remove "Bearer " prefix
    }

    // 2. Fallback to cookie
    const cookieStore = await cookies();
    return cookieStore.get('token')?.value || null;
}

/**
 * Get authenticated user payload from token.
 * Returns null if not authenticated.
 */
export async function getAuthPayload(): Promise<AuthPayload | null> {
    const token = await getAuthToken();
    if (!token) return null;

    const payload = verifyToken(token) as AuthPayload | null;
    if (!payload || !payload.userId) return null;

    return payload;
}
