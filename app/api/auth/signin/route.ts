import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongo';
import { verifyPassword } from '@/app/lib/auth';
import { signToken } from '@/app/lib/jwt';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        const db = await getDb();
        const usersCollection = db.collection('users');

        const user = await usersCollection.findOne({ email: email.toLowerCase() });

        if (!user) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Generate JWT
        const token = signToken({ userId: user._id, email: user.email, name: user.name });

        // Create response with cookie
        const response = NextResponse.json({ message: 'Login successful' }, { status: 200 });

        response.cookies.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
        });

        return response;

    } catch (error) {
        console.error('Signin error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
