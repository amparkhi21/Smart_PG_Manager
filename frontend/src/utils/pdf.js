import { formatMonth, round2 } from './format.js';

const formatMoney = (value) => `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const formatIndiaDate = (value, includeTime = false) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
  }).format(new Date(value));
};
const textValue = (value) => String(value ?? '-').replace(/[^\x20-\x7E]/g, ' ');
const newDocument = (jsPDF) => new jsPDF({ unit: 'mm', format: 'a4' });

function addReceiptLine(doc, label, value, y) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(textValue(label), 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(textValue(value), 105);
  doc.text(lines, 185, y, { align: 'right' });
  return y + Math.max(8, lines.length * 5);
}

export function getReceiptNumber(type, payment) {
  if (!payment?._id) return '';
  return `${type === 'Rent' ? 'RENT' : 'ELEC'}-${payment._id}`;
}

export async function createPaymentReceipt(type, record, payment, owner = {}) {
  if (!payment?._id || !(Number(payment.amount) > 0)) throw new Error('A recorded payment is required to create a receipt');
  const { jsPDF } = await import('jspdf');
  const doc = newDocument(jsPDF);
  const receiptNumber = getReceiptNumber(type, payment);
  const isRent = type === 'Rent';
  let y = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(13, 148, 136);
  doc.text('SMART PG MANAGER', 20, y);
  y += 14;
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(isRent ? 'Rent Payment Receipt' : 'Electricity Payment Receipt', 20, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Payment Recorded', 20, y);
  doc.text(`Receipt No: ${textValue(receiptNumber)}`, 185, y, { align: 'right' });
  y += 10;

  doc.setDrawColor(226, 232, 240);
  doc.line(20, y, 190, y);
  y += 10;
  y = addReceiptLine(doc, 'Property', owner.pgName || 'PG', y);
  if (owner.address) y = addReceiptLine(doc, 'Address', owner.address, y);
  if (owner.phone) y = addReceiptLine(doc, 'Contact', owner.phone, y);
  if (isRent) {
    y = addReceiptLine(doc, 'Resident', record.resident?.fullName || 'Resident', y);
  }
  y = addReceiptLine(doc, 'Room', record.room?.roomNumber || '-', y);
  y = addReceiptLine(doc, 'Billing month', formatMonth(record.month), y);
  if (!isRent) {
    y = addReceiptLine(doc, 'Units consumed', `${record.units} units`, y);
    y = addReceiptLine(doc, 'Rate per unit', formatMoney(record.ratePerUnit), y);
    y = addReceiptLine(doc, 'Total electricity bill', formatMoney(record.amount), y);
  }
  y = addReceiptLine(doc, 'Payment amount', formatMoney(payment.amount), y);
  y = addReceiptLine(doc, 'Payment date (Asia/Kolkata)', formatIndiaDate(payment.paidOn, true), y);
  y = addReceiptLine(doc, 'Payment method', payment.method || '-', y);
  if (payment.note) y = addReceiptLine(doc, 'Reference / note', payment.note, y);

  if (isRent && Number.isFinite(Number(record.amountDue))) {
    const index = (record.payments || []).findIndex((entry) => String(entry._id) === String(payment._id));
    if (index >= 0) {
      const paidThroughInstallment = round2(record.payments.slice(0, index + 1).reduce((total, entry) => total + Number(entry.amount || 0), 0));
      y = addReceiptLine(doc, 'Remaining after this installment', formatMoney(Math.max(0, record.amountDue - paidThroughInstallment)), y);
    }
  }

  y += 7;
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y, 190, y);
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('This receipt confirms a payment recorded by the property. It is not a bank verification or tax invoice.', 20, y, { maxWidth: 170 });
  return doc;
}

export async function downloadPaymentReceipt(type, record, payment, owner) {
  const doc = await createPaymentReceipt(type, record, payment, owner);
  doc.save(`${getReceiptNumber(type, payment)}.pdf`);
}

export async function createMonthlyReportPdf({ data, report, generatedAt = new Date() }) {
  const { jsPDF } = await import('jspdf');
  const doc = newDocument(jsPDF);
  const month = report.month;
  let y = 20;
  const line = (label, value, indent = 0) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', indent ? 'normal' : 'bold');
    doc.setFontSize(indent ? 10 : 11);
    doc.setTextColor(30, 41, 59);
    doc.text(textValue(label), 20 + indent, y);
    doc.text(textValue(value), 188, y, { align: 'right' });
    y += 7;
  };
  const heading = (label) => {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(13, 148, 136);
    doc.text(label, 20, y);
    y += 8;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(13, 148, 136);
  doc.text('SMART PG MANAGER', 20, y);
  y += 10;
  doc.setFontSize(19);
  doc.setTextColor(15, 23, 42);
  doc.text('Monthly Financial Report', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${textValue(data.owner?.pgName || 'PG')} · ${formatMonth(month)}`, 20, y);
  doc.text(`Generated ${formatIndiaDate(generatedAt, true)} IST`, 20, y + 6);
  y += 15;

  heading('Room occupancy (current)');
  line('Occupied rooms', `${report.occupancy.occupiedRooms} / ${report.occupancy.rooms}`, 2);
  line('Vacant rooms', String(report.occupancy.vacantRooms), 2);
  line('Active residents', String(report.occupancy.activeResidents), 2);
  line('Beds / capacity', String(report.occupancy.beds), 2);

  heading(`Billing totals · ${formatMonth(month)}`);
  line('Rent billed (billing month)', formatMoney(report.rentBilled), 2);
  line('Rent collected against these records (all payment dates)', formatMoney(report.rentCollected), 2);
  line('Current rent balance on these records', formatMoney(report.rentOutstanding), 2);
  line('Electricity billed (billing month)', formatMoney(report.electricityBilled), 2);
  line('Electricity collected against these records (all payment dates)', formatMoney(report.electricityCollected), 2);
  line('Current electricity balance on these records', formatMoney(report.electricityOutstanding), 2);
  line('Combined collected against selected billing month', formatMoney(report.combinedCollected));

  heading(`Payment transactions dated ${formatMonth(month)} (Asia/Kolkata)`);
  line('Rent received by payment date', formatMoney(report.rentReceivedInMonth), 2);
  line('Electricity received by payment date', formatMoney(report.electricityReceivedInMonth), 2);
  line('Total received by payment date', formatMoney(report.totalReceivedInMonth));

  heading('Outstanding dues · selected billing month');
  const outstandingRent = (data.rentRecords || []).filter((record) => record.month === month && Number(record.balance) > 0);
  const outstandingBills = (data.electricityBills || []).filter((bill) => bill.month === month && Number(bill.balance) > 0);
  outstandingRent.forEach((record) => line(`Rent · ${record.resident?.fullName || 'Resident'} · Room ${record.room?.roomNumber || '-'}`, formatMoney(record.balance), 2));
  outstandingBills.forEach((bill) => line(`Electricity · Room ${bill.room?.roomNumber || '-'}`, formatMoney(bill.balance), 2));
  if (!outstandingRent.length && !outstandingBills.length) line('No outstanding dues', formatMoney(0), 2);

  return doc;
}

export async function downloadMonthlyReportPdf(args) {
  const doc = await createMonthlyReportPdf(args);
  doc.save(`financial-report-${args.report.month}.pdf`);
}
