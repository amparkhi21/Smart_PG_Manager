import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { idParam, monthIn, paymentRules } from '../middlewares/validators.js';
import { PAYMENT_STATUSES } from '../constants.js';
import { getPrefill, createBill, listBills, getBill, addBillPayment } from '../controllers/electricityController.js';

const router = Router();
router.use(protect);

router.get('/prefill/:roomId', param('roomId').isMongoId().withMessage('Invalid room id'), validate, getPrefill);

router.post(
  '/',
  [
    body('room').isMongoId().withMessage('A valid room is required'),
    monthIn(body, 'month'),
    body('previousReading').optional().isFloat({ min: 0 }).withMessage('Previous reading must be 0 or more').toFloat(),
    body('currentReading').isFloat({ min: 0 }).withMessage('Current reading must be 0 or more').toFloat()
      .custom((v, { req }) => req.body.previousReading === undefined || v >= req.body.previousReading)
      .withMessage('Current reading cannot be less than the previous reading'),
    body('ratePerUnit').optional().isFloat({ min: 0 }).withMessage('Rate per unit must be 0 or more').toFloat(),
  ],
  validate,
  createBill
);

router.get(
  '/',
  [
    monthIn(query, 'month', { optional: true, allowFuture: true }),
    query('room').optional().isMongoId(),
    query('status').optional().isIn(PAYMENT_STATUSES),
  ],
  validate,
  listBills
);
router.get('/:id', idParam(), validate, getBill);
router.post('/:id/payments', idParam(), paymentRules, validate, addBillPayment);

export default router;