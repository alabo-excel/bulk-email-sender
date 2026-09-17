import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, initializeLocalState, getState, saveList, saveReport, getSentEmails, localStore } from '../app/lib/store.ts';

test('local state survives reload, isolates users, clears on sign-out, and reports quota failures', async () => {
  const entries = new Map();
  globalThis.localStorage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  let id = 'user_a';
  globalThis.fetch = async () => Response.json({ userId: id });
  await initializeLocalState(false);
  const list = saveList('My contacts', { headers: ['email'], rows: [{ email: 'a@example.com' }] });
  saveReport({ id: 'dry', listId: list.id, listName: list.name, startedAt: 1, finishedAt: 2, dryRun: true,
    attempts: [{ email: 'a@example.com', rowNumber: 1, subject: 'Hi', status: 'sent', sentAt: 2 }] });
  assert.equal(getSentEmails(list.id).size, 0);
  saveReport({ id: 'real', listId: list.id, listName: list.name, startedAt: 1, finishedAt: 2, dryRun: false,
    attempts: [{ email: 'a@example.com', rowNumber: 1, subject: 'Hi', status: 'sent', sentAt: 2 }] });
  assert.ok(getSentEmails(list.id).has('a@example.com'));
  clearSession();
  assert.equal(getState().lists.length, 0);
  await initializeLocalState(false);
  assert.equal(getState().lists[0].id, list.id);
  id = 'user_b';
  await initializeLocalState(false);
  assert.equal(getState().lists.length, 0);
  assert.equal(getState().reports.length, 0);
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => saveList('too big', { headers: [], rows: [] }), /storage is full/);
  assert.equal(getState().lists.length, 0);
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(initializeLocalState(false), (response) => response.status === 302 && response.headers.get('Location') === '/sign-in');
});
