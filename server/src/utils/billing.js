export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Shared by rent records and electricity bills
export function computeStatus(amountDue, amountPaid, dueDate) {
  if (amountPaid >= amountDue) return 'Paid';
  if (dueDate && new Date(dueDate) < new Date()) return 'Overdue';
  return amountPaid > 0 ? 'Partially Paid' : 'Pending';
}
