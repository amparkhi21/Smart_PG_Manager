import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query } from 'express-validator';
import { protectResident } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { listUnifiedRequests, getUnifiedRequest, createGeneralRequest, cancelGeneralRequest } from '../controllers/requestsController.js';
import { validateRequestQuery, validateGeneralRequestBody } from '../middlewares/requestValidators.js';

const router = Router();
router.use(protectResident());
const writes = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `resident-requests:${req.resident._id}`,
  message: { success: false, message: 'Too many requests submitted. Please try again later.' },
});
router.get('/', [...validateRequestQuery(query)], validate, listUnifiedRequests);
router.get('/:sourceType/:id', [param('sourceType').isIn(['payment', 'room-change', 'leave', 'general', 'complaint']), param('id').isMongoId(),
  query('historyPage').optional().isInt({ min: 1, max: 1000 }), query('historyLimit').optional().isInt({ min: 1, max: 50 })], validate, getUnifiedRequest);
router.post('/', writes, [...validateGeneralRequestBody(body)], validate, createGeneralRequest);
router.post('/:id/cancel', writes, param('id').isMongoId(), validate, cancelGeneralRequest);
export default router;
