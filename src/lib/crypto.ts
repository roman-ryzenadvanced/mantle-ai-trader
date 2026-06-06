import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derive a per-user encryption key from NEXTAUTH_SECRET + userId.
 * Uses iterated SHA-256 for key derivation.
 */
function deriveKey(userId: string): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || "mantle-default-secret";
  const material = `mantle-encryption:${secret}:${userId}`;
  return crypto.createHash("sha256").update(material).digest();
}

/**
 * Encrypt a plaintext string. Returns a base64-encoded string containing
 * the IV, auth tag, and ciphertext: base64(iv || tag || ciphertext).
 */
export function encrypt(plaintext: string, userId: string): string {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Prepend IV and tag to ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded string back to plaintext.
 */
export function decrypt(encoded: string, userId: string): string {
  const key = deriveKey(userId);
  const combined = Buffer.from(encoded, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}
