import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Provider secrets are stored encrypted (AES-256-GCM). The key comes from
 * PAYMENTS_ENCRYPTION_KEY, falling back to AUTH_SECRET so a deployment that has
 * not set the dedicated key still never stores plain text. Changing the key makes
 * existing secrets unreadable: re-enter them in Settings, Payments.
 */
function key() {
  const secret = process.env.PAYMENTS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set PAYMENTS_ENCRYPTION_KEY (or AUTH_SECRET) before saving payment credentials.");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const raw = Buffer.from(blob, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key or corrupted: treated as "not configured"
  }
}
