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
import MessMenu from '../src/models/MessMenu.js';
import { MEAL_KEYS } from '../src/constants.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { todayIST } from '../src/utils/dates.js';

await test('mess menu calendar switches days at Indian midnight, not UTC midnight', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T18:29:59Z') });
  assert.equal(todayIST(), '2026-11-20');
  t.mock.timers.tick(1000);
  assert.equal(todayIST(), '2026-11-21');
  t.mock.timers.tick(5.5 * 60 * 60 * 1000);
  assert.equal(todayIST(), '2026-11-21');
});

test('Phase 3A owner mess menus and resident read-only access on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'phase3a-isolated-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  // No dotenv, production URI or seed scripts: only a new local test database.
  mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: 'phase3a_test_' + randomUUID().replaceAll('-', '') },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), MessMenu.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase3a.test', password: 'OwnerPass123!', pgName: 'Same Hostel Name' },
    { name: 'Owner B', email: 'b@phase3a.test', password: 'OwnerPass123!', pgName: 'Same Hostel Name' },
  ]);
  const [room, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 2, monthlyRent: 4000 },
    { owner: otherOwner._id, roomNumber: '101', capacity: 2, monthlyRent: 4000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const [resident, otherResident] = await Resident.create([
    { owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210', monthlyRent: 4000, loginEnabled: true, accountStatus: 'active', passwordHash },
    { owner: otherOwner._id, room: otherRoom._id, fullName: 'Resident B', phone: '9876543210', monthlyRent: 4000, loginEnabled: true, accountStatus: 'active', passwordHash },
  ]);
  const ownerToken = generateToken(owner._id), otherOwnerToken = generateToken(otherOwner._id);
  const residentToken = generateResidentToken(resident), otherResidentToken = generateResidentToken(otherResident);
  const today = todayIST();
  const dateOffset = (offset) => {
    const date = new Date(today + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const tomorrow = dateOffset(1), dayTwo = dateOffset(2), dayThree = dateOffset(3), past = dateOffset(-1);
  const fourMeals = {
    breakfast: { items: ['Poha', 'Tea'], servingTime: '08:00-09:00', notes: 'Freshly prepared' },
    lunch: { items: ['Rice', 'Dal'], servingTime: '13:00' },
    eveningSnacks: { items: ['Fruit'], servingTime: '17:00-17:30' },
    dinner: { items: ['Chapati', 'Vegetables'], servingTime: '20:00-21:00' },
  };
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (method, path, body, token = ownerToken) => {
    const response = await fetch(base + path, { method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.doesNotMatch(JSON.stringify(data), /passwordHash|sessionVersion|occupancyRevision/);
    return { status: response.status, ...data };
  };

  await t.test('owners create four meals for today, schedule future menus and preserve omitted meals during edits', async () => {
    const created = await request('POST', '/mess-menus', { date: today, meals: fourMeals, owner: otherOwner._id });
    assert.equal(created.status, 201); assert.equal(created.data.date, today);
    assert.deepEqual(Object.keys(created.data.meals), MEAL_KEYS);
    assert.deepEqual(created.data.meals.breakfast.items, ['Poha', 'Tea']);
    assert.equal(created.data.meals.dinner.notes, '');
    assert.equal(created.data.meals.breakfast.servingTime, '08:00-09:00');
    assert.equal(created.data.owner, undefined);
    assert.equal(String((await MessMenu.findById(created.data.id)).owner), String(owner._id));
    assert.equal((await request('POST', '/mess-menus', { date: tomorrow, meals: fourMeals })).status, 201);
    assert.equal((await request('POST', '/mess-menus', { date: dayTwo })).status, 201);
    assert.equal((await request('POST', '/mess-menus', { date: past, meals: { dinner: { items: ['PAST_MEAL'], servingTime: '20:00' } } })).status, 201);
    const edited = await request('PUT', '/mess-menus/' + today, { owner: otherOwner._id, date: dayThree, meals: { lunch: { items: ['Rice', 'Dal', 'Salad'], notes: 'Seasonal salad' } } });
    assert.equal(edited.status, 200); assert.equal(edited.data.date, today);
    assert.equal(edited.data.meals.lunch.servingTime, '13:00');
    assert.deepEqual(edited.data.meals.breakfast.items, fourMeals.breakfast.items);
    const listed = await request('GET', '/mess-menus?from=' + today + '&to=' + dayTwo);
    assert.equal(listed.status, 200); assert.deepEqual(listed.data.map((menu) => menu.date), [today, tomorrow, dayTwo]);
  });
  await t.test('unique PG/date index rejects concurrent duplicates while identical dates in other PGs remain independent', async () => {
    const duplicates = await Promise.all([
      request('POST', '/mess-menus', { date: dayThree, meals: fourMeals }),
      request('POST', '/mess-menus', { date: dayThree, meals: fourMeals }),
    ]);
    assert.deepEqual(duplicates.map((result) => result.status).sort(), [201, 409]);
    assert.equal(await MessMenu.countDocuments({ owner: owner._id, date: dayThree }), 1);
    assert.equal((await request('POST', '/mess-menus', { date: today, meals: { lunch: { items: ['FOREIGN_TODAY'], servingTime: '13:00' } } }, otherOwnerToken)).status, 201);
    assert.equal((await request('POST', '/mess-menus', { date: tomorrow, meals: { dinner: { items: ['FOREIGN_FUTURE'], servingTime: '20:00' } } }, otherOwnerToken)).status, 201);
    assert.equal((await request('PUT', '/mess-menus/' + dayTwo, { meals: {} }, otherOwnerToken)).status, 404);
    assert.equal((await request('DELETE', '/mess-menus/' + dayTwo, undefined, otherOwnerToken)).status, 404);
    assert.equal((await request('GET', '/mess-menus/' + dayTwo, undefined, otherOwnerToken)).status, 404);
  });
  await t.test('invalid dates, times, food items and meal shapes are rejected; empty meals can be saved and cleared', async () => {
    for (const date of ['2026-02-30', '2026-13-01', '2026-11-20T00:00:00Z', '20-11-2026', 20261120]) {
      assert.equal((await request('POST', '/mess-menus', { date })).status, 400);
    }
    const badMeals = [
      null, [], { supper: {} }, { breakfast: null }, { breakfast: { unknown: 'value' } },
      { breakfast: { items: 'Rice' } }, { breakfast: { items: [' '] } }, { breakfast: { items: [{ $ne: null }] } },
      { breakfast: { items: Array(31).fill('Rice'), servingTime: '08:00' } },
      { breakfast: { items: ['Rice'], servingTime: '25:00' } }, { breakfast: { items: ['Rice'] } },
      { breakfast: { notes: 'x'.repeat(501) } }, { breakfast: { servingTime: { $ne: null } } },
    ];
    for (const meals of badMeals) assert.equal((await request('PUT', '/mess-menus/' + dayTwo, { meals })).status, 400);
    assert.equal((await request('GET', '/mess-menus?from=' + tomorrow + '&to=' + today)).status, 400);
    assert.equal((await request('GET', '/mess-menus?from[$ne]=x')).status, 400);
    const cleared = await request('PUT', '/mess-menus/' + today, { meals: { breakfast: { items: [], servingTime: '', notes: '' } } });
    assert.equal(cleared.status, 200); assert.deepEqual(cleared.data.meals.breakfast, { items: [], servingTime: '', notes: '' });
    assert.equal((await request('PUT', '/mess-menus/' + today, { meals: { breakfast: { items: ['Food without a time'] } } })).status, 400);
    const empty = await request('GET', '/mess-menus/' + dayTwo);
    for (const key of MEAL_KEYS) assert.deepEqual(empty.data.meals[key], { items: [], servingTime: '', notes: '' });
  });
  await t.test('residents read only their own PG today and future menus, never past dates or client-selected PGs', async () => {
    const snapshot = await MessMenu.collection.find({}).toArray();
    const injection = '?owner=' + otherOwner._id + '&pgId=' + otherOwner._id + '&date=' + past;
    const current = await request('GET', '/resident/mess-menus/today' + injection, undefined, residentToken);
    assert.equal(current.status, 200); assert.equal(current.data.date, today); assert.equal(current.data.menu.date, today);
    assert.deepEqual(current.data.menu.meals.lunch.items, ['Rice', 'Dal', 'Salad']);
    const upcoming = await request('GET', '/resident/mess-menus/upcoming' + injection, undefined, residentToken);
    assert.equal(upcoming.status, 200); assert.deepEqual(upcoming.data.menus.map((menu) => menu.date), [tomorrow, dayTwo, dayThree]);
    assert.doesNotMatch(JSON.stringify(upcoming.data), /FOREIGN_|PAST_MEAL/);
    assert.deepEqual((await request('GET', '/resident/mess-menus/today', undefined, otherResidentToken)).data.menu.meals.lunch.items, ['FOREIGN_TODAY']);
    for (const [method, path, body] of [
      ['GET', '/mess-menus'], ['POST', '/mess-menus', { date: dateOffset(4) }],
      ['PUT', '/mess-menus/' + today, { meals: {} }], ['DELETE', '/mess-menus/' + today],
    ]) assert.equal((await request(method, path, body, residentToken)).status, 403);
    for (const path of ['/resident/mess-menus/today', '/resident/mess-menus/upcoming']) {
      for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await request(method, path, { meals: {} }, residentToken)).status, 404);
      assert.equal((await request('GET', path, undefined, ownerToken)).status, 403);
      assert.equal((await request('GET', path, undefined, null)).status, 401);
    }
    assert.deepEqual(await MessMenu.collection.find({}).toArray(), snapshot);
  });
  await t.test('owner deletion is scoped and residents receive explicit empty results when no menu is scheduled', async () => {
    assert.equal((await request('DELETE', '/mess-menus/' + today)).status, 200);
    assert.equal((await request('DELETE', '/mess-menus/' + today)).status, 404);
    const emptyToday = await request('GET', '/resident/mess-menus/today', undefined, residentToken);
    assert.equal(emptyToday.status, 200); assert.equal(emptyToday.data.menu, null); assert.equal(emptyToday.data.date, today);
    assert.equal((await request('GET', '/resident/mess-menus/today', undefined, otherResidentToken)).data.menu.date, today);
    for (const date of [tomorrow, dayTwo, dayThree]) assert.equal((await request('DELETE', '/mess-menus/' + date)).status, 200);
    assert.deepEqual((await request('GET', '/resident/mess-menus/upcoming', undefined, residentToken)).data.menus, []);
    assert.equal((await request('GET', '/resident/mess-menus/upcoming', undefined, otherResidentToken)).data.menus.length, 1);
    resident.loginEnabled = false; await resident.save();
    assert.equal((await request('GET', '/resident/mess-menus/today', undefined, residentToken)).status, 401);
    otherResident.passwordChangeRequired = true; await otherResident.save();
    assert.equal((await request('GET', '/resident/mess-menus/upcoming', undefined, generateResidentToken(otherResident))).status, 403);
  });
});
