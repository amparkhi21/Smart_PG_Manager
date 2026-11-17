import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsv, summarizeReport } from './reports.js';
import { createMonthlyReportPdf, createPaymentReceipt, getReceiptNumber } from './pdf.js';

const sourceData = () => ({
  month: '2026-11',
  rooms: [{ _id: 'room-1', capacity: 3, currentResidents: 2 }],
  rentRecords: [
    {
      month: '2026-11',
      amountDue: 2000,
      amountPaid: 1500,
      balance: 500,
      payments: [
        { amount: 1000, paidOn: '2026-10-31T19:00:00.000Z' },
        { amount: 500, paidOn: '2026-11-20T08:00:00.000Z' },
      ],
    },
    {
      month: '2026-10',
      amountDue: 1000,
      amountPaid: 700,
      balance: 300,
      payments: [{ amount: 700, paidOn: '2026-11-10T08:00:00.000Z' }],
    },
  ],
  electricityBills: [{
    month: '2026-11',
    amount: 600,
    amountPaid: 200,
    balance: 400,
    payments: [{ amount: 200, paidOn: '2026-11-12T08:00:00.000Z' }],
  }],
});

test('monthly report separates billing-month totals from Asia/Kolkata payment-date totals', () => {
  const report = summarizeReport(sourceData());
  assert.equal(report.rentBilled, 2000);
  assert.equal(report.rentCollected, 1500);
  assert.equal(report.rentOutstanding, 500);
  assert.equal(report.electricityBilled, 600);
  assert.equal(report.electricityCollected, 200);
  assert.equal(report.combinedCollected, 1700);
  assert.equal(report.rentReceivedInMonth, 2200);
  assert.equal(report.totalReceivedInMonth, 2400);
  assert.deepEqual(report.occupancy, {
    rooms: 1, occupiedRooms: 1, vacantRooms: 0, activeResidents: 2, beds: 3,
  });
});

test('CSV export includes UTF-8 BOM, escapes cells and guards formula-leading text', () => {
  const csv = createCsv('residents', {
    residents: [{
      fullName: '=HYPERLINK("bad")',
      room: { roomNumber: '101, "A"\nwing' },
      status: 'Active',
      joiningDate: '2026-11-16T00:00:00.000Z',
      monthlyRent: 5000,
    }],
  }, '2026-11');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"101, ""A""\nwing"/);
  assert.match(csv, /,5000$/);
});

test('payment receipt IDs are stable and generated PDFs identify only recorded payments', async () => {
  const payment = { _id: 'abc123', amount: 500, paidOn: '2026-11-15T20:00:00.000Z', method: 'Cash' };
  assert.equal(getReceiptNumber('Rent', payment), 'RENT-abc123');
  assert.equal(getReceiptNumber('Rent', payment), getReceiptNumber('Rent', payment));
  const doc = await createPaymentReceipt('Rent', {
    month: '2026-11',
    amountDue: 1000,
    payments: [payment],
    resident: { fullName: 'Test Resident' },
    room: { roomNumber: '101' },
  }, payment, { pgName: 'Test PG' });
  const output = doc.output();
  assert.ok(output.startsWith('%PDF-'));
  assert.match(output, /Payment Recorded/);
  assert.match(output, /16 Nov 2026/);
  await assert.rejects(createPaymentReceipt('Rent', {}, { amount: 500 }, {}), /recorded payment/);
});

test('electricity receipts and monthly reports produce readable PDF documents', async () => {
  const payment = { _id: 'payment-2', amount: 300, paidOn: '2026-11-16T00:00:00.000Z', method: 'UPI', note: 'ref 42' };
  const bill = { month: '2026-11', units: 100, ratePerUnit: 6, amount: 600, room: { roomNumber: '202' } };
  const electricityPdf = (await createPaymentReceipt('Electricity', { ...bill, payments: [payment] }, payment, { pgName: 'Test PG' })).output();
  assert.match(electricityPdf, /Electricity Payment Receipt/);
  assert.match(electricityPdf, /Units consumed/);
  assert.match(electricityPdf, /Total electricity bill/);
  assert.match(electricityPdf, /ELEC-payment-2/);

  const data = sourceData();
  const report = summarizeReport(data);
  const reportPdf = (await createMonthlyReportPdf({ data: { ...data, owner: { pgName: 'Test PG' } }, report })).output();
  assert.ok(reportPdf.startsWith('%PDF-'));
  assert.match(reportPdf, /Monthly Financial Report/);
  assert.match(reportPdf, /Outstanding dues/);
});
