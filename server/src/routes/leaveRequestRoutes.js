import { Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { protect, protectResident } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { isRealDate, todayIST } from '../utils/dates.js';
import { LEAVE_STATUSES, leaveDurationDays } from '../models/LeaveRequest.js';
import { createLeaveRequest, listLeaveRequests, getLeaveRequest, cancelLeaveRequest, decideLeaveRequest } from '../controllers/leaveRequestController.js';

const dateRule = (chain) => chain.isString().bail().custom(isRealDate).withMessage('Use a real Indian calendar date in YYYY-MM-DD format');
function leaveRoutes(ownerView) {
  const router = Router(); router.use(ownerView ? protect : protectResident());
  const writes = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `${ownerView ? 'owner' : 'resident'}:${req.owner?._id || req.resident._id}`,
    message: { success: false, message: 'Too many leave updates. Please wait a minute and try again.' } });
  const id = () => param('id').isString().bail().isMongoId();
  router.get('/', [
    query('page').optional().isString().bail().matches(/^[1-9]\d{0,5}$/),
    query('limit').optional().isString().bail().matches(/^(?:[1-9]\d?|100)$/),
    query('status').optional().isString().bail().isIn(LEAVE_STATUSES),
    query('resident').optional().isString().bail().isMongoId(),
    dateRule(query('date').optional()), dateRule(query('fromDate').optional()), dateRule(query('toDate').optional()),
  ], validate, listLeaveRequests);
  if (!ownerView) router.post('/', writes, [
    dateRule(body('fromDate')).bail().custom((value) => value >= todayIST()).withMessage('Leave cannot start before today in India'),
    dateRule(body('toDate')),
    body().custom((value) => value.toDate >= value.fromDate && leaveDurationDays(value.fromDate, value.toDate) <= 365).withMessage('Choose an ordered leave period of at most 365 days'),
    body('reason').isString().bail().trim().isLength({ min: 1, max: 2000 }),
    body('emergencyContact').optional({ nullable: true }).isString().bail().trim().isLength({ max: 50 }).bail()
      .customSanitizer((value) => value.replace(/[\s()-]/g, '')).custom((value) => value === '' || /^\+?[0-9]{10,15}$/.test(value)).withMessage('Enter a valid emergency contact number'),
  ], validate, createLeaveRequest);
  router.get('/:id', id(), validate, getLeaveRequest);
  if (ownerView) router.patch('/:id/decision', writes, [id(), body('decision').isString().bail().isIn(['Approved', 'Rejected']),
    body('response').optional().isString().bail().trim().isLength({ max: 1000 }),
  ], validate, decideLeaveRequest);
  else router.post('/:id/cancel', writes, id(), validate, cancelLeaveRequest);
  return router;
}
export const residentLeaveRequestRoutes = leaveRoutes(false);
export default leaveRoutes(true);
