import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for stored OAuth tokens.
 *
 * These tokens grant write access to the customer's accounting system. Storing
 * them in plaintext would mean a database dump — or a leaked pooled connection
 * string — is on its own enough to issue invoices in their name. With the key
 * held in the environment rather than the database, an attacker needs both.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding a plausible wrong value.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for.

function key(): Buffer {
  const raw = process.env.XERO_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      "XERO_TOKEN_KEY is not set. Generate one with: openssl rand -hex 32\n" +
        "Without it Xero tokens cannot be read or written.",
    );
  }
  const buffer = Buffer.from(raw, "hex");
  if (buffer.length !== 32) {
    throw new Error(`XERO_TOKEN_KEY must be 32 bytes of hex (64 characters); got ${buffer.length} bytes.`);
  }
  return buffer;
}

/** Returns `iv.authTag.ciphertext`, all base64url, safe for a text column. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(encoded: string): string {
  const [ivPart, tagPart, dataPart] = encoded.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Stored token is not in the expected iv.tag.ciphertext form.");
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

export function tokenKeyConfigured(): boolean {
  const raw = process.env.XERO_TOKEN_KEY;
  return Boolean(raw) && Buffer.from(raw!, "hex").length === 32;
}
