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
import RentRecord from '../src/models/RentRecord.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import PaymentClaim from '../src/models/PaymentClaim.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const future = new Date(Date.now() + 40 * 864e5), tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 864e5));

test('Phase 5A resident payment claims and owner verification on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'phase5a-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: 'phase5a_test_' + randomUUID().replaceAll('-', '') },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), RentRecord.init(), ElectricityBill.init(), PaymentClaim.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase5a.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
    { name: 'Owner B', email: 'b@phase5a.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
  ]);
  const [room, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 4, monthlyRent: 5000 },
    { owner: otherOwner._id, roomNumber: '101', capacity: 4, monthlyRent: 5000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const base = { monthlyRent: 5000, passwordHash, loginEnabled: true, accountStatus: 'active' };
  const [resident, peer, foreign] = await Resident.create([
    { ...base, owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210' },
    { ...base, owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9876543211' },
    { ...base, owner: otherOwner._id, room: otherRoom._id, fullName: 'Foreign Resident', phone: '9876543210' },
  ]);
  const month = today.slice(0, 7);
  const [rent, foreignRent] = await RentRecord.create([
    { owner: owner._id, resident: resident._id, room: room._id, month, amountDue: 5000, dueDate: future },
    { owner: otherOwner._id, resident: foreign._id, room: otherRoom._id, month, amountDue: 5000, dueDate: future },
  ]);
  const [power] = await ElectricityBill.create([{ owner: owner._id, room: room._id, month, previousReading: 0, currentReading: 100, ratePerUnit: 8, dueDate: future }]);
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(otherOwner._id);
  const residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const api = 'http://127.0.0.1:' + server.address().port + '/api';
  const call = async (method, path, body, token = ownerToken) => {
    const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|reviewLock|@phase5a\.test/);
    return { status: response.status, ...result };
  };
  const claim = (extra, token = residentToken) => call('POST', '/resident/payments/claims', { billType: 'Rent', billId: String(rent._id), amount: 2000, utr: '412345678901', paymentDate: today, ...extra }, token);
  const approve = (id, token = ownerToken, body = { verifiedReceipt: true }) => call('POST', `/payment-claims/${id}/approve`, body, token);
  const fresh = (Model, id) => Model.findById(id);
  let first, second, third;

  await t.test('residents see only their own outstanding rent and their room electricity', async () => {
    const mine = await call('GET', '/resident/payments/bills', undefined, residentToken);
    assert.deepEqual(mine.data.map((bill) => [bill.billType, bill.balance, bill.claimableAmount]).sort(), [['Electricity', 800, 800], ['Rent', 5000, 5000]]);
    assert.deepEqual((await call('GET', '/resident/payments/bills', undefined, peerToken)).data.map((bill) => bill.billType), ['Electricity']);
    assert.equal((await call('GET', '/resident/payments/bills', undefined, foreignToken)).data.every((bill) => bill.id === String(foreignRent._id)), true);
    assert.equal((await call('GET', '/resident/payments/bills', undefined, ownerToken)).status, 403);
  });

  await t.test('claim validation, isolation and role checks', async () => {
    for (const bad of [{ utr: '123' }, { utr: 'bad utr!!' }, { amount: 0 }, { amount: 10.123 }, { amount: 5001 }, { paymentDate: tomorrow }, { paymentDate: '2026-02-30' }, { billType: 'Water' }, { billId: undefined }]) {
      assert.equal((await claim(bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await claim({}, peerToken)).status, 404, 'roommate cannot claim another resident rent');
    assert.equal((await claim({}, foreignToken)).status, 404, 'other PG cannot see this bill');
    assert.equal((await claim({}, ownerToken)).status, 403);
    assert.equal((await claim({}, null)).status, 401);
    assert.equal(await PaymentClaim.countDocuments(), 0);
  });

  await t.test('new claims stay Pending Verification and change no balance; duplicate UTRs are blocked', async () => {
    first = await claim({});
    assert.equal(first.status, 201); assert.equal(first.data.status, 'Pending Verification');
    const bill = await fresh(RentRecord, rent._id);
    assert.equal(bill.balance, 5000); assert.equal(bill.payments.length, 0);
    assert.equal((await claim({ utr: '412345678901'.toLowerCase(), amount: 100 })).status, 409, 'same UTR, any case');
    assert.equal((await claim({ billType: 'Electricity', billId: String(power._id), utr: '412345678901', amount: 100 }, peerToken)).status, 409, 'same UTR on another bill in this PG');
    assert.equal((await claim({ billId: String(foreignRent._id), utr: '412345678901' }, foreignToken)).status, 201, 'PG isolation: the other PG is unaffected');
    assert.equal((await claim({ amount: 3500, utr: 'AAAA11112222' })).status, 400, 'pending claims count against the claimable balance');
    second = await claim({ amount: 3000, utr: 'BBBB33334444' });
    assert.equal(second.status, 201);
    const view = await call('GET', '/resident/payments/bills', undefined, residentToken);
    assert.equal(view.data.find((b) => b.billType === 'Rent').claimableAmount, 0);
    assert.equal((await claim({ amount: 1, utr: 'CCCC55556666' })).status, 400);
  });

  await t.test('only the owner of the same PG can review, with explicit receipt verification', async () => {
    assert.equal((await approve(first.data.id, residentToken)).status, 403, 'residents cannot approve');
    assert.equal((await call('POST', `/payment-claims/${first.data.id}/reject`, {}, residentToken)).status, 403);
    assert.equal((await approve(first.data.id, foreignOwnerToken)).status, 404);
    assert.equal((await approve(first.data.id, ownerToken, {})).status, 400, 'must confirm the money was verified');
    const listed = await call('GET', '/payment-claims?status=Pending%20Verification');
    assert.equal(listed.count, 2); assert.match(listed.data[0].verificationWarning, /not proof of payment/);
    assert.equal((await call('GET', '/payment-claims', undefined, foreignOwnerToken)).count, 1);
    assert.equal((await call('GET', '/payment-claims', undefined, residentToken)).status, 403);
    assert.equal((await fresh(RentRecord, rent._id)).balance, 5000);
  });

  await t.test('rejected claims do not affect balances and release the UTR for a corrected claim', async () => {
    const rejected = await call('POST', `/payment-claims/${second.data.id}/reject`, { reason: 'Not received in my account' });
    assert.equal(rejected.status, 200); assert.equal(rejected.data.status, 'Rejected');
    assert.equal((await fresh(RentRecord, rent._id)).balance, 5000);
    const mine = await call('GET', '/resident/payments/claims', undefined, residentToken);
    assert.equal(mine.data.find((c) => c.id === second.data.id).reviewNote, 'Not received in my account');
    assert.equal((await approve(second.data.id)).status, 409, 'a rejected claim cannot be approved');
    third = await claim({ amount: 3000, utr: 'BBBB33334444' });
    assert.equal(third.status, 201);
  });

  await t.test('concurrent approvals record the payment exactly once', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => approve(first.data.id)));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.ok(results.every((r) => [200, 409].includes(r.status)));
    const bill = await fresh(RentRecord, rent._id);
    assert.equal(bill.payments.length, 1); assert.equal(bill.balance, 3000); assert.equal(bill.status, 'Partially Paid');
    assert.equal(bill.payments[0].method, 'UPI'); assert.equal(bill.payments[0].requestId, `claim-${first.data.id}`);
    assert.equal((await approve(first.data.id)).status, 409);
    assert.equal((await call('POST', `/payment-claims/${first.data.id}/reject`, {})).status, 409, 'approved claims cannot be rejected');
    assert.equal((await fresh(PaymentClaim, first.data.id)).status, 'Approved');
  });

  await t.test('partial payments complete the bill and never exceed the outstanding amount', async () => {
    assert.equal((await approve(third.data.id)).status, 200);
    const bill = await fresh(RentRecord, rent._id);
    assert.equal(bill.balance, 0); assert.equal(bill.status, 'Paid'); assert.equal(bill.payments.length, 2);
    assert.equal((await claim({ utr: 'DDDD77778888', amount: 1 })).status, 409, 'paid bills accept no claims');
    assert.equal((await call('GET', '/resident/payments/bills', undefined, residentToken)).data.some((b) => b.billType === 'Rent'), false);
  });

  await t.test('approval is refused when the bill balance dropped, and history is preserved', async () => {
    const e1 = await claim({ billType: 'Electricity', billId: String(power._id), amount: 500, utr: 'EEEE11112222' });
    assert.equal(e1.status, 201);
    const manual = await call('POST', `/electricity/${power._id}/payments`, { amount: 600, method: 'Cash' });
    assert.equal(manual.status, 201);
    const refused = await approve(e1.data.id);
    assert.equal(refused.status, 409);
    assert.equal((await fresh(PaymentClaim, e1.data.id)).status, 'Pending Verification');
    let bill = await fresh(ElectricityBill, power._id);
    assert.equal(bill.balance, 200); assert.equal(bill.payments.length, 1); assert.equal(bill.payments[0].method, 'Cash');
    assert.equal((await call('POST', `/payment-claims/${e1.data.id}/reject`, { reason: 'Bill already partly paid in cash' })).status, 200);
    // A smaller claim for the true balance can be approved; a racing approve and reject never disagree.
    const e2 = await claim({ billType: 'Electricity', billId: String(power._id), amount: 200, utr: 'EEEE33334444' });
    const raced = await Promise.all([approve(e2.data.id), call('POST', `/payment-claims/${e2.data.id}/reject`, { reason: 'race' })]);
    const final = await fresh(PaymentClaim, e2.data.id);
    bill = await fresh(ElectricityBill, power._id);
    assert.equal(raced.filter((r) => r.status === 200).length, 1);
    if (final.status === 'Approved') { assert.equal(bill.balance, 0); assert.equal(bill.payments.length, 2); }
    else { assert.equal(final.status, 'Rejected'); assert.equal(bill.balance, 200); assert.equal(bill.payments.length, 1); }
  });

  await t.test('other PG records were never touched', async () => {
    const other = await fresh(RentRecord, foreignRent._id);
    assert.equal(other.balance, 5000); assert.equal(other.payments.length, 0);
    assert.equal(await PaymentClaim.countDocuments({ owner: otherOwner._id }), 1);
  });
});
