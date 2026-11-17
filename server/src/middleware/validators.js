import { body, param } from 'express-validator';
import { currentMonthIST, todayIST, isRealDate } from '../utils/dates.js';
import { PAYMENT_METHODS } from '../utils/billing.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const idParam = (name = 'id') => param(name).isMongoId().withMessage(`Invalid ${name}`);

// loc = body | query | param from express-validator
export const monthIn = (loc, field = 'month', { optional = false, allowFuture = false } = {}) => {
  const chain = loc(field);
  if (optional) chain.optional();
  chain.matches(MONTH_RE).withMessage('Month must be in YYYY-MM format');
  if (!allowFuture) chain.custom((v) => v <= currentMonthIST()).withMessage('Month cannot be in the future');
  return chain;
};

export const dateIn = (loc, field = 'date', { optional = false } = {}) => {
  const chain = loc(field);
  if (optional) chain.optional();
  return chain
    .custom((v) => isRealDate(v)).withMessage('Date must be a real date in YYYY-MM-DD format')
    .custom((v) => v <= todayIST()).withMessage('Date cannot be in the future');
};

export const paymentRules = [
  body('requestId').optional().isUUID().withMessage('Invalid payment request ID'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0').toFloat(),
  body('method').optional().isIn(PAYMENT_METHODS).withMessage(`Method must be one of: ${PAYMENT_METHODS.join(', ')}`),
  body('paidOn')
    .optional()
    .isISO8601().withMessage('Invalid payment date')
    .custom((v) => new Date(v) <= new Date()).withMessage('Payment date cannot be in the future'),
  body('note').optional().isString().trim().isLength({ max: 200 }).withMessage('Note is too long'),
];