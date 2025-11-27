import crypto from 'crypto';

/**
 * Encryption Utility
 * Provides AES-256-GCM encryption/decryption for sensitive data like Shopify access tokens
 */

const ALGORITHM = 'aes-256-gcm';
const ENCODING = 'hex';
const AUTH_TAG_LENGTH = 16;
const IV_LENGTH = 16;

/**
 * Derives a key from the encryption key in environment
 */
function getKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  }

  // Use first 32 characters for AES-256 (256 bits = 32 bytes)
  return Buffer.from(encryptionKey.slice(0, 32));
}

/**
 * Encrypts plaintext using AES-256-GCM
 * Returns encrypted text in format: iv:encryptedText:authTag
 */
export const encrypt = (text: string): string => {
  try {
    const key = getKey();

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(text, 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Return iv:encrypted:authTag (all in hex)
    return `${iv.toString(ENCODING)}:${encrypted}:${authTag.toString(ENCODING)}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypts encrypted text using AES-256-GCM
 * Expected format: iv:encryptedText:authTag
 */
export const decrypt = (encryptedText: string): string => {
  try {
    const key = getKey();

    // Split the encrypted text
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], ENCODING);
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], ENCODING);

    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid auth tag length');
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Validates encryption setup
 * Used for startup checks
 */
export const validateEncryptionSetup = (): boolean => {
  try {
    const key = getKey();
    return key.length === 32;
  } catch {
    return false;
  }
};
