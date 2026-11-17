import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ElectricityBill from '../src/models/ElectricityBill.js';
import Owner from '../src/models/Owner.js';
import ReminderActivity from '../src/models/ReminderActivity.js';
import RentRecord from '../src/models/RentRecord.js';
import { listReminderActivity } from '../src/controllers/remindersController.js';

test('owner model defaults reminder preferences without connecting to a database', async () => {
  const owner = new Owner({ name: 'Owner', email: 'owner@example.test', password: 'password123', pgName: 'Test PG' });
  assert.equal(owner.rentDueDay, 5);
  assert.equal(owner.defaultElectricityRate, 8);
  assert.equal(owner.reminderSettings.preferredTiming, 'Anytime');
  assert.equal(owner.reminderSettings.duplicateWarningHours, 24);
  await owner.validate();
});

test('owner model rejects invalid future billing settings', async () => {
  const owner = new Owner({
    name: 'Owner',
    email: 'owner@example.test',
    password: 'password123',
    pgName: 'Test PG',
    rentDueDay: 29,
    defaultElectricityRate: -1,
  });
  const error = await owner.validate().catch((validationError) => validationError);
  assert.ok(error.errors.rentDueDay);
  assert.ok(error.errors.defaultElectricityRate);
});

test('reminder activity schema accepts only owner-reported, non-delivery statuses', async () => {
  const activity = new ReminderActivity({
    owner: new mongoose.Types.ObjectId(),
    ownerName: 'Owner',
    sourceType: 'Electricity',
    sourceId: new mongoose.Types.ObjectId(),
    billingMonth: '2026-11',
    reminderType: 'Pending Electricity',
    recipientId: new mongoose.Types.ObjectId(),
    recipientName: 'Resident',
    phone: '+919876543210',
    roomNumber: '101',
    status: 'WhatsApp opened',
    events: [{ status: 'WhatsApp opened', ownerName: 'Owner' }],
  });
  await activity.validate();
  activity.status = 'Delivered';
  const error = await activity.validate().catch((validationError) => validationError);
  assert.ok(error.errors.status);
});

test('reminder history queries only the authenticated owner and masks recipient phones', async () => {
  const methods = [
    [RentRecord, 'updateMany'],
    [ElectricityBill, 'updateMany'],
    [ReminderActivity, 'find'],
  ];
  const originals = methods.map(([model, method]) => model[method]);
  let capturedFilter;
  const now = new Date();
  RentRecord.updateMany = async () => ({});
  ElectricityBill.updateMany = async () => ({});
  ReminderActivity.find = (filter) => {
    capturedFilter = filter;
    return {
      sort() {
        return this;
      },
      limit: async () => [{
        _id: new mongoose.Types.ObjectId(),
        sourceType: 'Rent',
        sourceId: new mongoose.Types.ObjectId(),
        billingMonth: '2026-11',
        reminderType: 'Pending Rent',
        recipientId: new mongoose.Types.ObjectId(),
        recipientName: 'Resident',
        phone: '+919876543210',
        roomNumber: '101',
        status: 'Draft',
        events: [{ status: 'Draft', at: now, ownerName: 'Owner A' }],
      }],
    };
  };

  try {
    let response;
    await listReminderActivity(
      { owner: { _id: 'owner-a' }, query: {} },
      { json: (body) => { response = body; } },
      (error) => { throw error; }
    );
    assert.equal(String(capturedFilter.owner), 'owner-a');
    assert.equal(response.data[0].phone, '*********3210');
    assert.equal(response.data[0].ownerName, 'Owner A');
  } finally {
    methods.forEach(([model, method], index) => {
      model[method] = originals[index];
    });
  }
});
