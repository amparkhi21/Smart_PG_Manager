import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { listUnifiedRequests, getUnifiedRequest, updateGeneralRequest } from '../controllers/requestsController.js';
import { validateRequestQuery, validateRequestOwnerBody } from '../middlewares/requestValidators.js';

const router = Router();
router.use(protect);
router.get('/', [...validateRequestQuery(query)], validate, listUnifiedRequests);
router.get('/:sourceType/:id', [param('sourceType').isIn(['payment', 'room-change', 'leave', 'general', 'complaint']), param('id').isMongoId(),
  query('historyPage').optional().isInt({ min: 1, max: 1000 }), query('historyLimit').optional().isInt({ min: 1, max: 50 })], validate, getUnifiedRequest);
router.patch('/general/:id', [param('id').isMongoId(), ...validateRequestOwnerBody(body)], validate, updateGeneralRequest);
export default router;
