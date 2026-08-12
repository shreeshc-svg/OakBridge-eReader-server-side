import crypto from 'crypto';

/**
 * Derives a unique 256-bit AES key and a 96-bit (12-byte) IV deterministically
 * based on the book ID and the server-wide DRM secret.
 */
export function deriveBookDrmKey(bookId: string) {
     const secret = process.env.DRM_SERVER_SECRET || 'oakbridge-super-secret-drm-key-2026';
     
     // Derive a 32-byte key using HMAC-SHA256
     const key = crypto
          .createHmac('sha256', secret)
          .update(bookId)
          .digest();
          
     // Derive a 12-byte IV using HMAC-SHA256
     const iv = crypto
          .createHmac('sha256', secret)
          .update(bookId + '-iv')
          .digest()
          .slice(0, 12);
          
     return { key, iv };
}

/**
 * Encrypts a buffer using AES-256-GCM.
 * Prepend the 16-byte auth tag at the beginning of the resulting buffer
 * so that standard web/client decryptors can read the tag easily.
 */
export function encryptBookBuffer(buffer: Buffer, key: Buffer, iv: Buffer): Buffer {
     const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
     const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
     const authTag = cipher.getAuthTag(); // 16 bytes
     
     // Return authTag + encrypted content
     return Buffer.concat([authTag, encrypted]);
}

/**
 * Decrypts a buffer using AES-256-GCM.
 * Assumes the first 16 bytes of the buffer are the auth tag.
 */
export function decryptBookBuffer(buffer: Buffer, key: Buffer, iv: Buffer): Buffer {
     const authTag = buffer.slice(0, 16);
     const encryptedData = buffer.slice(16);
     
     const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
     decipher.setAuthTag(authTag);
     
     return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}
