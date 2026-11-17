import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderMessage, createWhatsAppUrl, filterOutstandingRecords, normalizeWhatsAppPhone, renderReminderTemplate } from './reminders.js';

test('normalizes Indian phone numbers and rejects malformed values', () => {
  assert.equal(normalizeWhatsAppPhone('98765 43210'), '919876543210');
  assert.equal(normalizeWhatsAppPhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizeWhatsAppPhone('09876543210'), '919876543210');
  assert.equal(normalizeWhatsAppPhone('not-a-number 9876543210'), null);
  assert.equal(normalizeWhatsAppPhone('+1 (202) 555-0100'), '12025550100');
  assert.equal(normalizeWhatsAppPhone('1234567890'), null);
  assert.equal(normalizeWhatsAppPhone('+91 12345 67890'), null);
  assert.equal(normalizeWhatsAppPhone('123'), null);
});

test('encodes message text in the official click-to-chat URL', () => {
  const url = createWhatsAppUrl('9876543210', 'Pending: ₹3,000 & due');
  assert.equal(url, 'https://wa.me/919876543210?text=Pending%3A%20%E2%82%B93%2C000%20%26%20due');
  assert.throws(() => createWhatsAppUrl('12', 'hello'), /valid phone number/);
});

test('renders only known template tokens', () => {
  assert.equal(renderReminderTemplate('Hi {residentName}: {balance} {unknown}', { residentName: 'Rohit', balance: '₹3,000' }), 'Hi Rohit: ₹3,000 {unknown}');
});

test('excludes paid records and filters outstanding rent and electricity by billing month', () => {
  const pending = filterOutstandingRecords(
    [
      { month: '2026-11', balance: 3000 },
      { month: '2026-11', balance: 0 },
      { month: '2026-10', balance: 1000 },
    ],
    [
      { month: '2026-11', balance: 248 },
      { month: '2026-11', balance: 0 },
    ],
    '2026-11'
  );
  assert.deepEqual(pending.rents, [{ month: '2026-11', balance: 3000 }]);
  assert.deepEqual(pending.electricity, [{ month: '2026-11', balance: 248 }]);
});

test('creates a rent reminder from the persisted rent record values', () => {
  const message = createReminderMessage(
    {
      sourceType: 'Rent',
      room: { roomNumber: '101' },
      bill: { status: 'Pending', month: '2026-11', amountDue: 5000, amountPaid: 2000, balance: 3000, dueDate: '2026-11-05' },
    },
    { fullName: 'Rohit' },
    { pgName: 'Sharma PG' }
  );
  assert.match(message, /Rohit/);
  assert.match(message, /Sharma PG/);
  assert.match(message, /Monthly Rent: ₹5,000/);
  assert.match(message, /Amount Paid: ₹2,000/);
  assert.match(message, /Pending Balance: ₹3,000/);
});

test('creates an electricity reminder with units and room-level bill totals', () => {
  const message = createReminderMessage(
    {
      sourceType: 'Electricity',
      room: { roomNumber: '202' },
      bill: { status: 'Overdue', month: '2026-11', units: 56, amount: 448, amountPaid: 200, balance: 248, dueDate: '2026-11-05' },
    },
    { fullName: 'Asha' },
    { pgName: 'Sharma PG' }
  );
  assert.match(message, /56/);
  assert.match(message, /Total Bill: ₹448/);
  assert.match(message, /Amount Paid: ₹200/);
  assert.match(message, /Pending Amount: ₹248/);
  assert.match(message, /overdue/);
});
