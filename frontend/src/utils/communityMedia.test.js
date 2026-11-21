import test from 'node:test';
import assert from 'node:assert/strict';
import { photoError, noticeExpiry, PHOTO_MAX_BYTES } from './communityMedia.js';

test('photo validation accepts supported formats at the size limit and rejects unsupported, empty and oversized files', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(photoError({ type, size: PHOTO_MAX_BYTES }), '');
  for (const file of [null, { type: 'image/svg+xml', size: 20 }, { type: 'text/html', size: 20 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: PHOTO_MAX_BYTES + 1 }]) assert.ok(photoError(file));
});
test('notice expiry follows the end of the selected Indian calendar day across UTC dates', () => {
  assert.equal(new Date(noticeExpiry('2026-11-20')).toISOString(), '2026-11-20T18:29:59.999Z');
  assert.equal(new Date(noticeExpiry('2028-02-29')).toISOString(), '2028-02-29T18:29:59.999Z');
  assert.equal(noticeExpiry(''), null);
});
