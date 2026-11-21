import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import CommunityMessage from '../src/models/CommunityMessage.js';
import Notice from '../src/models/Notice.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { IMAGE_MAX_BYTES, imageType } from '../src/utils/communityImages.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4v5ThPwAG7wKkCcxydAAAAABJRU5ErkJggg==', 'base64');

test('Phase 4C private photos and notices on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase4c-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, instance: { dbName: 'phase4c_test_' + randomUUID().replaceAll('-', '') } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), CommunityMessage.init(), Notice.init()]);
  const [owner, foreignOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase4c.test', password: 'OwnerPass123!', pgName: 'Same PG' },
    { name: 'Owner B', email: 'b@phase4c.test', password: 'OwnerPass123!', pgName: 'Same PG' },
  ]);
  const [room, otherRoom] = await Room.create([{ owner: owner._id, roomNumber: '101', monthlyRent: 4000, capacity: 4 }, { owner: foreignOwner._id, roomNumber: '101', monthlyRent: 4000, capacity: 4 }]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const [resident, peer, foreignResident] = await Resident.create([
    { owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
    { owner: owner._id, room: room._id, fullName: 'Peer', phone: '9876543211', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
    { owner: foreignOwner._id, room: otherRoom._id, fullName: 'Other PG', phone: '9876543210', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
  ]);
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(foreignOwner._id);
  const residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreignResident);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/community';
  const request = async (method, path, body, token = ownerToken, type = 'application/json') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': type, ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: type === 'application/json' ? JSON.stringify(body) : body }) });
    const data = response.headers.get('content-type')?.startsWith('image/') ? Buffer.from(await response.arrayBuffer()) : await response.json();
    return { status: response.status, headers: response.headers, data };
  };
  const upload = (token = residentToken) => request('POST', '/images', PNG, token, 'image/png');
  let photo, notice;

  await t.test('photos are stored in GridFS and served only to authenticated members of the same PG', async () => {
    const result = await upload(); assert.equal(result.status, 201); photo = result.data.data;
    assert.equal(photo.sender.id, String(resident._id)); assert.equal(photo.pgId, String(owner._id));
    assert.equal(photo.image.contentType, 'image/png'); assert.equal(photo.image.size, PNG.length);
    assert.equal(await mongoose.connection.db.collection('communityImages.files').countDocuments({ _id: new mongoose.Types.ObjectId(photo.image.id), 'metadata.owner': owner._id }), 1);
    assert.equal(await mongoose.connection.db.collection('communityImages.chunks').countDocuments({ files_id: new mongoose.Types.ObjectId(photo.image.id) }), 1);
    for (const token of [ownerToken, residentToken, peerToken]) {
      const read = await request('GET', '/images/' + photo.image.id, undefined, token);
      assert.equal(read.status, 200); assert.deepEqual(read.data, PNG); assert.match(read.headers.get('cache-control'), /no-store/); assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
    }
    for (const token of [foreignToken, foreignOwnerToken]) assert.equal((await request('GET', '/images/' + photo.image.id, undefined, token)).status, 404);
    assert.equal((await request('GET', '/images/' + photo.image.id, undefined, null)).status, 401);
    const history = await request('GET', '/messages', undefined, peerToken);
    assert.equal(history.data.data.messages[0].image.id, photo.image.id); assert.equal(history.data.data.messages[0].canDelete, false);
  });
  await t.test('photo validation rejects unsupported, spoofed and oversized content without persisting uploads', async () => {
    const before = await mongoose.connection.db.collection('communityImages.files').countDocuments();
    assert.equal(imageType(PNG).type, 'image/png');
    for (const [buffer, type] of [[Buffer.from('<svg/>'), 'image/svg+xml'], [Buffer.from('<html>bad</html>'), 'image/png'], [PNG, 'image/jpeg'], [Buffer.alloc(0), 'image/png']]) assert.equal((await request('POST', '/images', buffer, residentToken, type)).status, 400);
    assert.equal((await request('POST', '/images', Buffer.alloc(IMAGE_MAX_BYTES + 1), residentToken, 'image/png')).status, 413);
    assert.equal(await mongoose.connection.db.collection('communityImages.files').countDocuments(), before);
    assert.equal((await request('POST', '/images', PNG, null, 'image/png')).status, 401);
  });
  await t.test('image deletion uses message permissions and removes both GridFS files and chunks', async () => {
    assert.equal((await request('DELETE', '/messages/' + photo.id, undefined, peerToken)).status, 404);
    assert.equal((await request('DELETE', '/messages/' + photo.id, undefined, foreignOwnerToken)).status, 404);
    assert.equal((await request('DELETE', '/messages/' + photo.id, undefined, residentToken)).status, 200);
    assert.equal((await request('GET', '/images/' + photo.image.id, undefined, ownerToken)).status, 404);
    for (const collection of ['communityImages.files', 'communityImages.chunks']) assert.equal(await mongoose.connection.db.collection(collection).countDocuments(), 0);
    const second = await upload(); assert.equal(second.status, 201);
    assert.equal((await request('DELETE', '/messages/' + second.data.data.id)).status, 200);
    assert.equal(await mongoose.connection.db.collection('communityImages.files').countDocuments(), 0);
    assert.equal(await CommunityMessage.countDocuments({ 'image.fileId': { $exists: true } }), 0);
  });
  await t.test('owners create, edit, pin and expire independent PG notices; residents see only active notices', async () => {
    const created = await request('POST', '/notices', { title: 'Water maintenance', body: 'Please store water.', owner: foreignOwner._id });
    assert.equal(created.status, 201); notice = created.data.data; assert.equal(notice.pgId, String(owner._id));
    assert.equal((await request('PUT', '/notices/' + notice.id, { title: 'Water update', body: 'Water available after 5 PM.', pinned: false, expiresAt: '2099-11-20T23:59:59.999+05:30' })).status, 200);
    assert.equal((await request('PATCH', '/notices/' + notice.id + '/pin', { pinned: true })).status, 200);
    assert.equal((await request('POST', '/notices', { title: 'Expired', body: 'Old update', expiresAt: '2000-01-01T00:00:00Z' })).status, 201);
    assert.equal((await request('POST', '/notices', { title: 'Foreign private notice', body: 'PG B only' }, foreignOwnerToken)).status, 201);
    const own = (await request('GET', '/notices')).data.data.notices;
    assert.equal(own.length, 2); assert.equal(own[0].id, notice.id); assert.equal(own[0].pinned, true); assert.equal(own[1].isExpired, true);
    const visible = (await request('GET', '/notices?owner=' + foreignOwner._id, undefined, residentToken)).data.data.notices;
    assert.equal(visible.length, 1); assert.equal(visible[0].title, 'Water update'); assert.equal(visible[0].isNew, true);
    assert.equal((await request('GET', '/notices', undefined, foreignToken)).data.data.notices.length, 1);
  });
  await t.test('notice authorization blocks resident writes and cross-PG owners', async () => {
    const payload = { title: 'Unauthorized', body: 'Cannot publish', pinned: true };
    for (const [method, path, body] of [['POST', '/notices', payload], ['PUT', '/notices/' + notice.id, payload], ['PATCH', '/notices/' + notice.id + '/pin', { pinned: false }], ['DELETE', '/notices/' + notice.id]]) assert.equal((await request(method, path, body, residentToken)).status, 403);
    for (const [method, path, body] of [['PUT', '/notices/' + notice.id, payload], ['PATCH', '/notices/' + notice.id + '/pin', { pinned: false }], ['DELETE', '/notices/' + notice.id]]) assert.equal((await request(method, path, body, foreignOwnerToken)).status, 404);
    assert.equal((await request('GET', '/notices', undefined, null)).status, 401);
    assert.equal((await request('POST', '/notices', { title: ' ', body: '' })).status, 400);
    assert.equal((await request('PUT', '/notices/' + notice.id, { title: 'Valid', body: 'Text', expiresAt: '2026-02-30' })).status, 400);
    assert.equal((await request('PATCH', '/notices/' + notice.id + '/pin', { pinned: 'true' })).status, 400);
  });
  await t.test('new-notice read receipts are resident-specific, monotonic and preserve authentication state', async () => {
    const before = await Resident.findById(resident._id).select('+passwordHash').lean();
    const data = (await request('GET', '/notices', undefined, residentToken)).data.data;
    assert.equal((await request('POST', '/notices/read', { through: data.readThrough }, residentToken)).status, 200);
    assert.equal((await request('GET', '/notices', undefined, residentToken)).data.data.notices[0].isNew, false);
    assert.equal((await request('GET', '/notices', undefined, peerToken)).data.data.notices[0].isNew, true);
    assert.equal((await request('POST', '/notices/read', { through: '2000-01-01T00:00:00Z' }, residentToken)).status, 200);
    const after = await Resident.findById(resident._id).select('+passwordHash').lean();
    assert.equal(after.sessionVersion, before.sessionVersion); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.monthlyRent, before.monthlyRent); assert.equal(String(after.room), String(before.room));
    assert.equal(after.noticeSeenAt.toISOString(), data.readThrough);
    assert.equal((await request('POST', '/notices/read', { through: '2099-01-01T00:00:00Z' }, residentToken)).status, 400);
    assert.equal((await request('POST', '/notices/read', { through: data.readThrough })).status, 403);
    await Resident.updateOne({ _id: resident._id }, { $set: { noticeSeenAt: new Date('2000-01-01T00:00:00Z') } });
    assert.equal((await request('GET', '/notices', undefined, residentToken)).data.data.notices[0].isNew, true);
  });
  await t.test('inactive and departed residents cannot access photos or notices; owner deletion removes notices', async () => {
    const uploaded = await upload(); assert.equal(uploaded.status, 201);
    for (const change of [{ accountStatus: 'disabled' }, { status: 'Left' }]) {
      await Resident.updateOne({ _id: resident._id }, { $set: { loginEnabled: true, accountStatus: 'active', status: 'Active', ...change } });
      assert.equal((await request('GET', '/notices', undefined, residentToken)).status, 401);
      assert.equal((await request('GET', '/images/' + uploaded.data.data.image.id, undefined, residentToken)).status, 401);
      assert.equal((await upload()).status, 401);
    }
    assert.equal((await request('DELETE', '/notices/' + notice.id)).status, 200);
    assert.equal(await Notice.countDocuments({ _id: notice.id }), 0);
  });
});
