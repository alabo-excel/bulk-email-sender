import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptedPassword } from "./types";

export type { EncryptedPassword };

/**
 * AES-256-GCM with a key held only in VAULT_KEY on the server. The browser
 * stores the ciphertext and never receives the key, so localStorage is useless
 * on its own — decrypting requires an authenticated request to this server.
 *
 * The key must never be exposed to the client. In particular it must not be
 * named VITE_*, since Vite inlines those into the browser bundle.
 */
function vaultKey(): Buffer {
  const raw = process.env.VAULT_KEY?.trim() ?? "";
  if (!raw) {
    throw new Error(
      "VAULT_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("VAULT_KEY must decode to 32 bytes. Generate one with `openssl rand -base64 32`.");
  }
  return key;
}

/** Cheap startup check so a misconfigured key fails clearly, not mid-send. */
export function vaultKeyIssue(): string | null {
  try { vaultKey(); return null; }
  catch (error) { return error instanceof Error ? error.message : "VAULT_KEY is invalid."; }
}

export function encryptPassword(password: string, userId: string): EncryptedPassword {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  // Binds the blob to one account: another user's ciphertext fails the auth tag
  // rather than silently decrypting.
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ct = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptPassword(value: EncryptedPassword, userId: string): string {
  if (!isEncryptedPassword(value)) throw new Error("Unsupported credential format.");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(value.iv, "base64"));
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ct, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedPassword(value: unknown): value is EncryptedPassword {
  if (!value || typeof value !== "object") return false;
  const blob = value as EncryptedPassword;
  return blob.v === 1
    && typeof blob.iv === "string" && blob.iv.length <= 32
    && typeof blob.ct === "string" && blob.ct.length <= 8192
    && typeof blob.tag === "string" && blob.tag.length <= 32;
}
