import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessages, reconcileMessages, isOwnMessage, messageError, communityError } from './community.js';

const message = (id, extra = {}) => ({ id, pgId: 'pg-a', text: 'Message ' + id, createdAt: '2026-11-20T08:00:00Z', sender: { id: 'member-a', role: 'resident' }, ...extra });

test('chat merging sorts chronological messages, deduplicates overlapping pages and rejects foreign PG data', () => {
  const result = mergeMessages([message('2'), message('1'), message('foreign-old', { pgId: 'pg-b' })], [message('2', { text: 'Updated' }), message('3'), message('foreign', { pgId: 'pg-b' })], 'pg-a');
  assert.deepEqual(result.map((item) => item.id), ['1', '2', '3']);
  assert.equal(result[1].text, 'Updated');
  assert.deepEqual(mergeMessages(result, [message('0', { createdAt: '2026-11-21T00:00:00Z' })], 'pg-a').map((item) => item.id), ['1', '2', '3', '0']);
});

test('refresh reconciles deletions in the fetched range while preserving loaded older history', () => {
  const current = ['1', '2', '3', '4', '5'].map((id) => message(id));
  assert.deepEqual(reconcileMessages(current, [message('6'), message('5'), message('3')], 'pg-a', true).map((item) => item.id), ['1', '2', '3', '5', '6']);
  assert.deepEqual(reconcileMessages(current, [], 'pg-a', false), []);
  assert.deepEqual(reconcileMessages(current, [message('6')], 'pg-a', false).map((item) => item.id), ['6']);
});

test('refresh responses cannot erase a locally confirmed send while a request is in flight', () => {
  assert.deepEqual(reconcileMessages([message('1'), message('3')], [message('2'), message('1')], 'pg-a', false, true).map((item) => item.id), ['1', '2', '3']);
});

test('own-message identity requires both sender ID and authenticated role', () => {
  assert.equal(isOwnMessage(message('1'), 'member-a', 'resident'), true);
  assert.equal(isOwnMessage(message('1'), 'member-a', 'owner'), false);
  assert.equal(isOwnMessage(message('1'), 'member-b', 'resident'), false);
});

test('message validation rejects whitespace and overlong content, preserving multiline text', () => {
  assert.match(messageError(' \n '), /Write a message/);
  assert.match(messageError('x'.repeat(2001)), /2000/);
  assert.equal(messageError('x'.repeat(2000)), '');
  assert.equal(messageError('Hello\nHow are you?'), '');
});

test('rate limit errors explain the retry delay and uncertain writes retain existing connection guidance', () => {
  assert.match(communityError({ response: { status: 429, headers: { 'retry-after': '42' } } }), /42 seconds/);
  assert.match(communityError({ response: { status: 429 } }), /wait a minute/);
  assert.match(communityError({ config: { method: 'post' } }), /refresh and check whether your change was saved/);
  assert.match(communityError({ communityScope: true }), /verify your PG/);
});
