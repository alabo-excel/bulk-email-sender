export type EncryptedPassword = { version: 1; salt: number[]; iv: number[]; ciphertext: number[] };

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function encryptPassword(password: string, passphrase: string, userId: string): Promise<EncryptedPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, key, new TextEncoder().encode(password),
  );
  return { version: 1, salt: [...salt], iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] };
}

export async function decryptPassword(value: EncryptedPassword, passphrase: string, userId: string) {
  if (value.version !== 1) throw new Error("Unsupported credential version.");
  const key = await deriveKey(passphrase, new Uint8Array(value.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(value.iv), additionalData: new TextEncoder().encode(userId) }, key, new Uint8Array(value.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
