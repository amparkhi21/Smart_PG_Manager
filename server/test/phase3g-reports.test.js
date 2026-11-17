import test from 'node:test';
import assert from 'node:assert/strict';
import Attendance from '../src/models/Attendance.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import RentRecord from '../src/models/RentRecord.js';
import Resident from '../src/models/Resident.js';
import Room from '../src/models/Room.js';
import { getMonthlyReportData } from '../src/controllers/reportsController.js';
import { appendPaymentAtomically } from '../src/utils/billing.js';

const queryWith = (value) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  lean: async () => value,
});

test('reports query all source models by authenticated owner and do not write financial data', async () => {
  const models = [Room, Resident, RentRecord, ElectricityBill, Attendance];
  const originals = models.map((model) => model.find);
  const filters = [];
  const id = 'resident-1';
  const roomId = 'room-1';
  Room.find = (filter) => { filters.push(filter); return queryWith([{ _id: roomId, roomNumber: '101', capacity: 2 }]); };
  Resident.find = (filter) => {
    filters.push(filter);
    return queryWith([{ _id: id, fullName: 'Resident', status: 'Active', room: { _id: roomId, roomNumber: '101' } }]);
  };
  RentRecord.find = (filter) => { filters.push(filter); return queryWith([]); };
  ElectricityBill.find = (filter) => { filters.push(filter); return queryWith([]); };
  Attendance.find = (filter) => { filters.push(filter); return queryWith([]); };
  try {
    let response;
    await getMonthlyReportData(
      { owner: { _id: 'owner-a', name: 'Owner', pgName: 'Test PG' }, query: { month: '2026-11' } },
      { json: (body) => { response = body; } },
      (error) => { throw error; }
    );
    assert.equal(filters.length, 5);
    assert.ok(filters.every((filter) => String(filter.owner) === 'owner-a'));
    assert.deepEqual(response.data.rooms[0].currentResidents, 1);
    assert.equal(response.data.owner.pgName, 'Test PG');
    assert.equal(response.data.month, '2026-11');
  } finally {
    models.forEach((model, index) => { model.find = originals[index]; });
  }
});

test('payment update atomically checks the current owner balance before appending', async () => {
  let capturedFilter;
  let capturedUpdate;
  const model = {
    findOneAndUpdate(filter, update, options) {
      capturedFilter = filter;
      capturedUpdate = update;
      assert.equal(options.new, true);
      return Promise.resolve({ _id: 'record-1' });
    },
  };
  await appendPaymentAtomically(model, 'owner-a', 'record-1', {
    amount: 125.25,
    method: 'UPI',
    paidOn: '2026-11-16T12:00:00+05:30',
    note: 'ref-1',
    requestId: '4ee91d43-d93a-4914-98de-e5b087e9813a',
  });
  assert.equal(String(capturedFilter.owner), 'owner-a');
  assert.deepEqual(capturedFilter.balance, { $gte: 125.25, $gt: 0 });
  assert.deepEqual(capturedFilter['payments.requestId'], { $ne: '4ee91d43-d93a-4914-98de-e5b087e9813a' });
  const update = capturedUpdate[0].$set;
  assert.deepEqual(update.balance, { $round: [{ $subtract: ['$balance', 125.25] }, 2] });
  const payment = update.payments.$concatArrays[1].$literal[0];
  assert.equal(payment.amount, 125.25);
  assert.equal(payment.method, 'UPI');
  assert.equal(payment.note, 'ref-1');
  assert.equal(payment.requestId, '4ee91d43-d93a-4914-98de-e5b087e9813a');
  assert.ok(payment._id);
});
