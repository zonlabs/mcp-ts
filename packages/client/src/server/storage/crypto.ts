import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const ENCRYPTION_PREFIX = 'enc:1:';

let warningLogged = false;

function getKey(): Buffer | null {
    const keyString = process.env.STORAGE_ENCRYPTION_KEY;
    if (!keyString) return null;
    
    // Ensure key is 32 bytes (256 bits)
    if (keyString.length === 64) {
        return Buffer.from(keyString, 'hex');
    } else {
        const keyBuffer = Buffer.alloc(32);
        keyBuffer.write(keyString, 0, 32, 'utf-8');
        return keyBuffer;
    }
}

/**
 * Encrypts an object into a secure string.
 * Falls back to returning the original object if the encryption key is missing or encryption fails.
 */
export function encryptObject(data: any): any {
    if (data === undefined || data === null) return data;
    
    const key = getKey();
    if (!key) {
        if (!warningLogged) {
            console.warn('[mcp-ts][Storage] WARNING: STORAGE_ENCRYPTION_KEY is not set. Saving sensitive data in plain-text.');
            warningLogged = true;
        }
        return data; // Fallback to plain-text
    }

    try {
        const text = JSON.stringify(data);
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(text, 'utf-8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        
        return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (e) {
        console.error('[mcp-ts][Storage] Encryption failed, falling back to plain-text.', e);
        return data;
    }
}

/**
 * Decrypts a secure string back into an object.
 * Returns the original data if it is unencrypted or if decryption fails.
 */
export function decryptObject(data: any): any {
    if (data === undefined || data === null) return data;
    if (typeof data !== 'string' || !data.startsWith(ENCRYPTION_PREFIX)) {
        return data; // Already unencrypted or old plain-text data
    }

    const key = getKey();
    if (!key) {
        console.warn('[mcp-ts][Storage] WARNING: Found encrypted data but STORAGE_ENCRYPTION_KEY is missing. Returning raw encrypted string.');
        return data;
    }

    try {
        const parts = data.split(':');
        if (parts.length !== 5) {
            return data;
        }

        const iv = Buffer.from(parts[2], 'hex');
        const authTag = Buffer.from(parts[3], 'hex');
        const encryptedText = parts[4];

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');

        return JSON.parse(decrypted);
    } catch (e) {
        console.error('[mcp-ts][Storage] Decryption failed.', e);
        return data;
    }
}
