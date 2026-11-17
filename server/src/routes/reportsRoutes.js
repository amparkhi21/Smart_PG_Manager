import { Router } from 'express';
import { query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { monthIn } from '../middleware/validators.js';
import { getMonthlyReportData } from '../controllers/reportsController.js';

const router = Router();

router.use(protect);
router.get('/', monthIn(query, 'month', { optional: true }), validate, getMonthlyReportData);

export default router;
