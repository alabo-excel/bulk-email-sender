import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAuthRoute } from '../app/lib/auth-routes.ts';

test('sign-in and sign-up stay public for document and client data requests', () => {
  for (const path of ['/sign-in', '/sign-up', '/sign-in.data', '/sign-up.data', '/sign-up/verify-email-address', '/sign-up/verify-email-address.data', '/sign-in/factor-one.data']) {
    assert.equal(isPublicAuthRoute(path), true, path);
  }
});

test('protected and similarly named routes remain protected', () => {
  for (const path of ['/', '/_root.data', '/onboarding.data', '/settings.data', '/sign-up-admin', '/sign-in-private.data', '/lists/123.data']) {
    assert.equal(isPublicAuthRoute(path), false, path);
  }
});
