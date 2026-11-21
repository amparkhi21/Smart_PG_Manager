import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { CLAIM_STATUSES, BILL_TYPES } from '../models/PaymentClaim.js';
import { listClaims, approveClaim, rejectClaim } from '../controllers/paymentClaimController.js';

// Owner-only. `protect` rejects resident tokens, so a resident can never review (or approve) a claim.
const router = Router();
router.use(protect);
const id = param('id').isMongoId().withMessage('Invalid claim id');

router.get('/', [
  query('status').optional().isIn(CLAIM_STATUSES),
  query('billType').optional().isIn(BILL_TYPES),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], validate, listClaims);
router.post('/:id/approve', id, [
  body('verifiedReceipt').custom((value) => value === true).withMessage('Confirm that you verified the money in your own UPI/bank account before approving'),
  body('note').optional().isString().trim().isLength({ max: 500 }),
], validate, approveClaim);
router.post('/:id/reject', id, [body('reason').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 })], validate, rejectClaim);
export default router;
