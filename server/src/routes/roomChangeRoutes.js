import { Router } from 'express';
import { body, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { idParam } from '../middleware/validators.js';
import { listRoomChanges, decideRoomChange } from '../controllers/roomChangeController.js';

const router = Router();
router.use(protect);
router.get('/', query('status').optional().isString().bail().isIn(['Pending', 'Approved', 'Rejected']), validate, listRoomChanges);
router.patch('/:id/decision', idParam(), [
  body('decision').isString().bail().isIn(['Approved', 'Rejected']),
  body('decisionNote').optional().isString().bail().trim().isLength({ max: 500 }),
], validate, decideRoomChange);
export default router;
