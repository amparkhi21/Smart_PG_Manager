import { Router } from 'express';
import { protectResident } from '../middleware/auth.js';
import { getResidentDashboard, getResidentOwnProfile } from '../controllers/residentPortalController.js';
import { body, query } from 'express-validator';
import validate from '../middleware/validate.js';
import { getMyRoom, getRoomAvailability } from '../controllers/residentRoomController.js';
import { createRoomChange, listRoomChanges, cancelRoomChangeRequest } from '../controllers/roomChangeController.js';
import { getTodaysMessMenu, getUpcomingMessMenus } from '../controllers/messMenuController.js';
import rateLimit from 'express-rate-limit';
import { dateIn, idParam } from '../middleware/validators.js';
import { CLAIM_STATUSES, BILL_TYPES } from '../models/PaymentClaim.js';
import { listMyBills, listMyClaims, submitClaim, cancelMyClaim, getMyPaymentDetails, listMyPaymentHistory } from '../controllers/paymentClaimController.js';

const router = Router();
router.use(protectResident());
router.get('/dashboard', getResidentDashboard);
router.get('/profile', getResidentOwnProfile);
router.get('/mess-menus/today', getTodaysMessMenu);
router.get('/mess-menus/upcoming', getUpcomingMessMenus);
router.get('/room-change-requests', query('status').optional().isString().bail().isIn(['Pending', 'Approved', 'Rejected']), validate, listRoomChanges);
router.post('/room-change-requests', [
  body('targetRoom').isString().bail().isMongoId().withMessage('Choose an available room'),
  body('targetBedNumber').optional({ nullable: true }).isString().bail().trim().isLength({ max: 20 }),
  body('reason').isString().bail().trim().isLength({ min: 5, max: 1000 }).withMessage('Enter a reason between 5 and 1000 characters'),
], validate, createRoomChange);
router.post('/room-change-requests/:id/cancel', idParam(), validate, cancelRoomChangeRequest);
router.get('/payments/bills', listMyBills);
router.get('/payments/details', getMyPaymentDetails);
router.get('/payments/history', query('month').optional().isString().bail().matches(/^\d{4}-(0[1-9]|1[0-2])$/), validate, listMyPaymentHistory);
router.get('/payments/claims', query('status').optional().isIn(CLAIM_STATUSES), validate, listMyClaims);
router.post('/payments/claims/:id/cancel', rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `claim-cancel:${req.resident._id}`,
  message: { success: false, message: 'Too many payment claim updates. Please wait a minute and try again.' },
}), idParam(), validate, cancelMyClaim);
router.post('/payments/claims', rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `claim:${req.resident._id}`,
  message: { success: false, message: 'Too many payment claims. Please wait a minute and try again.' },
}), [
  body('billType').isIn(BILL_TYPES).withMessage('Bill type must be Rent or Electricity'),
  body('billId').optional().isMongoId().withMessage('Invalid bill'),
  body('month').optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('Month must be YYYY-MM'),
  body().custom((value) => Boolean(value.billId || value.month)).withMessage('Provide the bill or its month'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0').bail()
    .custom((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6).withMessage('Amount can have at most 2 decimal places').toFloat(),
  body('utr').isString().bail().trim().matches(/^[A-Za-z0-9]{8,22}$/).withMessage('Enter the UPI transaction reference (UTR): 8 to 22 letters or digits'),
  dateIn(body, 'paymentDate'),
], validate, submitClaim);
router.get('/my-room', getMyRoom);
router.get('/rooms', [
  query('search').optional().isString().bail().trim().isLength({ max: 100 }),
  query('floor').optional().isString().bail().trim().isLength({ max: 20 }),
  query('roomType').optional().isString().bail().trim().isLength({ max: 40 }),
  query('availability').optional().isIn(['Full', 'Vacant', 'Partially Occupied']),
], validate, getRoomAvailability);
export default router;
