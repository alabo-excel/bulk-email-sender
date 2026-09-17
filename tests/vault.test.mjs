import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPassword, decryptPassword } from '../app/lib/vault.ts';

test('password encryption roundtrips and uses fresh salt/IV', async () => {
  const password = 'mailbox-secret-🗝';
  const one = await encryptPassword(password, 'long vault passphrase', 'user_a');
  const two = await encryptPassword(password, 'long vault passphrase', 'user_a');
  assert.equal(await decryptPassword(one, 'long vault passphrase', 'user_a'), password);
  assert.notDeepEqual(one.salt, two.salt);
  assert.notDeepEqual(one.iv, two.iv);
  assert.ok(!JSON.stringify(one).includes(password));
});
test('wrong passphrase, different account, and tampered ciphertext are rejected', async () => {
  const encrypted = await encryptPassword('mail-password', 'long vault passphrase', 'user_a');
  await assert.rejects(decryptPassword(encrypted, 'wrong passphrase', 'user_a'));
  await assert.rejects(decryptPassword(encrypted, 'long vault passphrase', 'user_b'));
  encrypted.ciphertext[0] ^= 1;
  await assert.rejects(decryptPassword(encrypted, 'long vault passphrase', 'user_a'));
});
