import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { idParam, monthIn } from '../middlewares/validators.js';
import { createReminderDraft, listReminderActivity, updateReminderActivity } from '../controllers/remindersController.js';

const router = Router();
const reminderActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reminder actions. Please try again later.' },
});

router.use(protect);
router.get(
  '/activity',
  [
    monthIn(query, 'month', { optional: true, allowFuture: true }),
    query('type').optional().isIn(['Rent', 'Electricity']).withMessage('Invalid reminder type'),
  ],
  validate,
  listReminderActivity
);
router.post(
  '/activity',
  reminderActionLimiter,
  [
    body('sourceType').isIn(['Rent', 'Electricity']).withMessage('Invalid reminder source'),
    body('sourceId').isMongoId().withMessage('Invalid billing record'),
    body('recipientId').isMongoId().withMessage('Invalid recipient'),
  ],
  validate,
  createReminderDraft
);
router.patch(
  '/activity/:id',
  reminderActionLimiter,
  idParam(),
  body('action').isIn(['opened', 'confirmed']).withMessage('Invalid reminder action'),
  validate,
  updateReminderActivity
);

export default router;
