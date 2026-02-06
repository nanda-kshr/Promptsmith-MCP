import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongo';
import { hashPassword } from '@/app/lib/auth';
import { encryptApiKey, generateUserSalt } from '@/app/lib/encryption';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, geminiApiKey, password, confirmPassword } = body;

        // 1. Basic Validation
        if (!name || !email || !geminiApiKey || !password || !confirmPassword) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        if (password !== confirmPassword) {
            return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
        }

        // Check for ENCRYPTION_KEY
        const serverKey = process.env.ENCRYPTION_KEY;
        if (!serverKey) {
            console.error("Missing ENCRYPTION_KEY in .env");
            return NextResponse.json({ error: 'Internal Server Error: Encryption configuration missing' }, { status: 500 });
        }

        const db = await getDb();
        const usersCollection = db.collection('users');

        // 2. Check if user exists
        const normalizedEmail = email.toLowerCase();
        const existingUser = await usersCollection.findOne({ email: normalizedEmail });

        if (existingUser) {
            return NextResponse.json({ error: 'User already exists with this email' }, { status: 409 });
        }

        // 3. Prepare Secure Data
        const userSalt = generateUserSalt();
        const hashedPassword = await hashPassword(password);
        const encryptedKey = await encryptApiKey(geminiApiKey, serverKey, userSalt);

        // 4. Create User
        const newUser = {
            name,
            email: normalizedEmail,
            password: hashedPassword,
            geminiApiKey: encryptedKey,
            salt: userSalt,
            createdAt: new Date(),
        };

        await usersCollection.insertOne(newUser);

        return NextResponse.json({ message: 'User created successfully' }, { status: 201 });

    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
