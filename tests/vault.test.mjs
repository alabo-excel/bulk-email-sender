import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.VAULT_KEY = randomBytes(32).toString('base64');
const { encryptPassword, decryptPassword, isEncryptedPassword, vaultKeyIssue } =
  await import('../app/lib/vault.server.ts');

test('password roundtrips and uses a fresh IV each time', () => {
  const password = 'mail-password';
  const one = encryptPassword(password, 'user_a');
  const two = encryptPassword(password, 'user_a');
  assert.equal(decryptPassword(one, 'user_a'), password);
  assert.equal(decryptPassword(two, 'user_a'), password);
  assert.notEqual(one.iv, two.iv);
  assert.notEqual(one.ct, two.ct);
  // The blob the browser stores must not contain the plaintext.
  assert.ok(!JSON.stringify(one).includes(password));
});

test('another account, a tampered blob, or a rotated key are all rejected', () => {
  const encrypted = encryptPassword('mail-password', 'user_a');

  assert.throws(() => decryptPassword(encrypted, 'user_b'));

  const tamperedCt = { ...encrypted, ct: Buffer.from('tampered').toString('base64') };
  assert.throws(() => decryptPassword(tamperedCt, 'user_a'));

  const tamperedTag = { ...encrypted, tag: Buffer.alloc(16).toString('base64') };
  assert.throws(() => decryptPassword(tamperedTag, 'user_a'));

  const previous = process.env.VAULT_KEY;
  process.env.VAULT_KEY = randomBytes(32).toString('base64');
  assert.throws(() => decryptPassword(encrypted, 'user_a'));
  process.env.VAULT_KEY = previous;
});

test('malformed blobs are rejected before reaching the cipher', () => {
  for (const bad of [null, undefined, 'string', {}, { v: 2, iv: 'a', ct: 'b', tag: 'c' }]) {
    assert.equal(isEncryptedPassword(bad), false);
    assert.throws(() => decryptPassword(bad, 'user_a'));
  }
});

test('a missing or malformed key is reported clearly', () => {
  const previous = process.env.VAULT_KEY;

  delete process.env.VAULT_KEY;
  assert.match(vaultKeyIssue(), /VAULT_KEY is not set/);

  process.env.VAULT_KEY = randomBytes(16).toString('base64');
  assert.match(vaultKeyIssue(), /32 bytes/);

  process.env.VAULT_KEY = previous;
  assert.equal(vaultKeyIssue(), null);
});
