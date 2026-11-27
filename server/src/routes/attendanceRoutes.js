import { Router } from 'express';
import { body, query } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { dateIn, monthIn } from '../middlewares/validators.js';
import { getAttendance, markAttendance, getMonthlySummary } from '../controllers/attendanceController.js';

const router = Router();
router.use(protect);

const STATUSES = ['Present', 'Absent', 'On Leave'];
const filters = [query('room').optional().isMongoId(), query('resident').optional().isMongoId()];

router.get('/', dateIn(query, 'date', { optional: true }), filters, validate, getAttendance);
router.get('/summary', monthIn(query, 'month', { optional: true }), filters, validate, getMonthlySummary);
router.put(
  '/',
  [
    dateIn(body, 'date'),
    body('records').isArray({ min: 1, max: 200 }).withMessage('records must be a list of 1 to 200 entries'),
    body('records.*.resident').isMongoId().withMessage('Invalid resident id'),
    body('records.*.status').isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
    body('records.*.note').optional().isString().trim().isLength({ max: 200 }),
  ],
  validate,
  markAttendance
);

export default router;