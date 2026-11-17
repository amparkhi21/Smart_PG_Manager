import { round2 } from './format.js';

const monthInIndia = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}`;
};

const sum = (items, select) => round2(items.reduce((total, item) => total + (Number(select(item)) || 0), 0));
const recordsForMonth = (records, month) => records.filter((record) => record.month === month);
const paymentDateTotal = (records, month) =>
  sum(records.flatMap((record) => record.payments || []), (payment) =>
    monthInIndia(payment.paidOn) === month ? payment.amount : 0
  );

export function summarizeReport({ month, rooms = [], rentRecords = [], electricityBills = [] }) {
  const rents = recordsForMonth(rentRecords, month);
  const bills = recordsForMonth(electricityBills, month);
  const occupancy = {
    rooms: rooms.length,
    occupiedRooms: rooms.filter((room) => room.currentResidents > 0).length,
    vacantRooms: rooms.filter((room) => room.currentResidents === 0).length,
    activeResidents: rooms.reduce((total, room) => total + (Number(room.currentResidents) || 0), 0),
    beds: sum(rooms, (room) => room.capacity),
  };
  const rentBilled = sum(rents, (record) => record.amountDue);
  const rentCollected = sum(rents, (record) => record.amountPaid);
  const rentOutstanding = sum(rents, (record) => record.balance);
  const electricityBilled = sum(bills, (bill) => bill.amount);
  const electricityCollected = sum(bills, (bill) => bill.amountPaid);
  const electricityOutstanding = sum(bills, (bill) => bill.balance);
  const rentReceivedInMonth = paymentDateTotal(rentRecords, month);
  const electricityReceivedInMonth = paymentDateTotal(electricityBills, month);

  return {
    month,
    occupancy,
    rentBilled,
    rentCollected,
    rentOutstanding,
    electricityBilled,
    electricityCollected,
    electricityOutstanding,
    combinedCollected: round2(rentCollected + electricityCollected),
    rentReceivedInMonth,
    electricityReceivedInMonth,
    totalReceivedInMonth: round2(rentReceivedInMonth + electricityReceivedInMonth),
  };
}

const istDate = (date) =>
  date
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date))
    : '';
const roomLabel = (record) => record.room?.roomNumber || '';
const residentLabel = (record) => record.resident?.fullName || '';
const receiptNumber = (type, payment) => `${type === 'Rent' ? 'RENT' : 'ELEC'}-${payment._id}`;

const rowsForExport = (kind, data, month) => {
  const { rooms = [], residents = [], attendance = [], rentRecords = [], electricityBills = [] } = data;
  if (kind === 'rooms') {
    return [
      ['Room', 'Floor', 'Capacity', 'Current residents', 'Occupancy', 'Monthly rent (INR)', 'Current meter reading'],
      ...rooms.map((room) => [room.roomNumber, room.floor || '', room.capacity, room.currentResidents, room.currentResidents ? 'Occupied' : 'Vacant', room.monthlyRent, room.lastMeterReading]),
    ];
  }
  if (kind === 'residents') {
    return [
      ['Resident', 'Room', 'Status', 'Joining date', 'Monthly rent (INR)'],
      ...residents.map((resident) => [resident.fullName, roomLabel(resident), resident.status, istDate(resident.joiningDate), resident.monthlyRent]),
    ];
  }
  if (kind === 'attendance') {
    return [
      ['Date', 'Resident', 'Room', 'Status'],
      ...attendance.map((item) => [item.date, residentLabel(item), roomLabel(item), item.status]),
    ];
  }
  if (kind === 'rent-records') {
    return [
      ['Billing month', 'Resident', 'Room', 'Rent billed (INR)', 'Collected against record (INR)', 'Current balance (INR)', 'Status', 'Installment count'],
      ...rentRecords.filter((record) => record.month === month).map((record) => [
        record.month, residentLabel(record), roomLabel(record), record.amountDue, record.amountPaid, record.balance, record.status, record.payments?.length || 0,
      ]),
    ];
  }
  if (kind === 'rent-payments') {
    return [
      ['Payment date (Asia/Kolkata)', 'Billing month', 'Resident', 'Room', 'Method', 'Reference / note', 'Receipt number', 'Amount (INR)'],
      ...rentRecords.flatMap((record) => (record.payments || []).map((payment) => [
        istDate(payment.paidOn), record.month, residentLabel(record), roomLabel(record), payment.method, payment.note || '',
        receiptNumber('Rent', payment), payment.amount,
      ])),
    ];
  }
  if (kind === 'electricity-bills') {
    return [
      ['Billing month', 'Room', 'Units', 'Rate per unit (INR)', 'Bill amount (INR)', 'Collected against record (INR)', 'Current balance (INR)', 'Status'],
      ...electricityBills.map((bill) => [
        bill.month, roomLabel(bill), bill.units, bill.ratePerUnit, bill.amount, bill.amountPaid, bill.balance, bill.status,
      ]),
    ];
  }
  if (kind === 'electricity-payments') {
    return [
      ['Payment date (Asia/Kolkata)', 'Billing month', 'Room', 'Method', 'Reference / note', 'Receipt number', 'Amount (INR)'],
      ...electricityBills.flatMap((bill) => (bill.payments || []).map((payment) => [
        istDate(payment.paidOn), bill.month, roomLabel(bill), payment.method, payment.note || '',
        receiptNumber('Electricity', payment), payment.amount,
      ])),
    ];
  }
  if (kind === 'monthly-summary') {
    const report = summarizeReport({ month, rooms, rentRecords, electricityBills });
    return [
      ['Metric', 'Value', 'Period / meaning'],
      ['Rent billed', report.rentBilled, `Billing month ${month}`],
      ['Rent collected against selected billing month', report.rentCollected, `Payments on records for billing month ${month}, regardless of payment date`],
      ['Current rent balance', report.rentOutstanding, `Current balance on records for billing month ${month}`],
      ['Electricity billed', report.electricityBilled, `Billing month ${month}`],
      ['Electricity collected against selected billing month', report.electricityCollected, `Payments on records for billing month ${month}, regardless of payment date`],
      ['Current electricity balance', report.electricityOutstanding, `Current balance on records for billing month ${month}`],
      ['Combined collected against selected billing month', report.combinedCollected, `Billing month ${month}`],
      ['Payments received', report.totalReceivedInMonth, `Transactions dated in ${month} (Asia/Kolkata)`],
      ['Occupied rooms (current)', report.occupancy.occupiedRooms, 'As of report generation'],
      ['Total rooms (current)', report.occupancy.rooms, 'As of report generation'],
      ['Active residents (current)', report.occupancy.activeResidents, 'As of report generation'],
    ];
  }
  throw new Error(`Unknown CSV export type: ${kind}`);
};

const csvCell = (value) => {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '""';
  let text = String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function createCsv(kind, data, month) {
  return `\uFEFF${rowsForExport(kind, data, month).map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function downloadCsv(kind, data, month) {
  const blob = new Blob([createCsv(kind, data, month)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${kind}-${month}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
