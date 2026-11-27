import { Router } from 'express';
import { body, query } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { idParam, monthIn, paymentRules } from '../middlewares/validators.js';
import { PAYMENT_STATUSES } from '../constants.js';
import { generateRent, listRent, getRent, addRentPayment } from '../controllers/rentController.js';

const router = Router();
router.use(protect);

router.post('/generate', monthIn(body, 'month', { optional: true }), validate, generateRent);
router.get(
  '/',
  [
    monthIn(query, 'month', { optional: true, allowFuture: true }),
    query('room').optional().isMongoId(),
    query('resident').optional().isMongoId(),
    query('status').optional().isIn(PAYMENT_STATUSES),
  ],
  validate,
  listRent
);
router.get('/:id', idParam(), validate, getRent);
router.post('/:id/payments', idParam(), paymentRules, validate, addRentPayment);

export default router;