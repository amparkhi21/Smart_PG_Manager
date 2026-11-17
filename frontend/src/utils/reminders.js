import { formatCurrency, formatDate, formatMonth } from './format.js';

export const DEFAULT_REMINDER_TEMPLATES = {
  pendingRent: `Hello {residentName},

This is a friendly payment reminder from {pgName}.

Room Number: {roomNumber}
Rent Month: {billingMonth}
Monthly Rent: {amountDue}
Amount Paid: {amountPaid}
Pending Balance: {balance}
Due Date: {dueDate}

Kindly clear your pending rent at your earliest convenience.

Thank you,
{pgName} Management`,
  overdueRent: `Hello {residentName},

This is a friendly reminder from {pgName} that your rent payment is overdue.

Room Number: {roomNumber}
Rent Month: {billingMonth}
Monthly Rent: {amountDue}
Amount Paid: {amountPaid}
Pending Balance: {balance}
Due Date: {dueDate}

Please clear the outstanding amount at your earliest convenience.

Thank you,
{pgName} Management`,
  pendingElectricity: `Hello {residentName},

This is a friendly electricity payment reminder from {pgName}.

Room Number: {roomNumber}
Billing Month: {billingMonth}
Units Consumed: {units}
Total Bill: {amountDue}
Amount Paid: {amountPaid}
Pending Amount: {balance}

Kindly clear the pending electricity bill at your earliest convenience.

Thank you,
{pgName} Management`,
  overdueElectricity: `Hello {residentName},

This is a friendly reminder from {pgName} that the electricity bill for your room is overdue.

Room Number: {roomNumber}
Billing Month: {billingMonth}
Units Consumed: {units}
Total Bill: {amountDue}
Amount Paid: {amountPaid}
Pending Amount: {balance}

Please clear the outstanding amount at your earliest convenience.

Thank you,
{pgName} Management`,
};

export function filterOutstandingRecords(rentRecords, electricityBills, month) {
  return {
    rents: rentRecords.filter((record) => record.month === month && record.balance > 0),
    electricity: electricityBills.filter((bill) => bill.month === month && bill.balance > 0),
  };
}

export function normalizeWhatsAppPhone(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!/^\+?[\d\s()-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  const international = raw.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (/^91\d{10}$/.test(digits)) return /^91[6-9]\d{9}$/.test(digits) ? digits : null;
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return international && digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function createWhatsAppUrl(phone, message) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) throw new Error('Enter a valid phone number before preparing a WhatsApp message.');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function createReminderMessage(item, recipient, owner) {
  const isRent = item.sourceType === 'Rent';
  const overdue = item.bill.status === 'Overdue';
  const key = `${overdue ? 'overdue' : 'pending'}${item.sourceType}`;
  const template = owner.reminderSettings?.templates?.[key] || DEFAULT_REMINDER_TEMPLATES[key];
  const bill = item.bill;

  return renderReminderTemplate(template, {
    residentName: recipient.fullName,
    pgName: owner.pgName,
    roomNumber: item.room.roomNumber,
    billingMonth: formatMonth(bill.month),
    amountDue: formatCurrency(isRent ? bill.amountDue : bill.amount),
    amountPaid: formatCurrency(bill.amountPaid),
    balance: formatCurrency(bill.balance),
    dueDate: formatDate(bill.dueDate),
    units: bill.units ?? '-',
  });
}

export function renderReminderTemplate(template, values) {
  return template.replace(/\{([a-zA-Z]+)\}/g, (token, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token
  );
}

