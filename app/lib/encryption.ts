import { scrypt, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Generate a random salt for the user
export function generateUserSalt(): string {
    return randomBytes(16).toString('hex');
}

// Derive a key from the server secret and user salt
async function deriveKey(serverKey: string, userSalt: string): Promise<Buffer> {
    // combine them however you prefer, here just passing both to scrypt 
    // treating serverKey as "password" and userSalt as validation salt
    // scrypt generates a 32-byte key for AES-256
    return (await scryptAsync(serverKey, userSalt, 32)) as Buffer;
}

// Encrypt the API key
export async function encryptApiKey(apiKey: string, serverKey: string, userSalt: string): Promise<string> {
    const key = await deriveKey(serverKey, userSalt);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Return iv:authTag:encrypted so we can decrypt later
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// Decrypt the API key (for future use)
export async function decryptApiKey(encryptedString: string, serverKey: string, userSalt: string): Promise<string> {
    const [ivHex, authTagHex, encryptedHex] = encryptedString.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) {
        throw new Error('Invalid encrypted string format');
    }

    const key = await deriveKey(serverKey, userSalt);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
