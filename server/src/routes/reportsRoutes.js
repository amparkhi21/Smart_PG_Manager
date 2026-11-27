import { Router } from 'express';
import { query } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { monthIn } from '../middlewares/validators.js';
import { getMonthlyReportData } from '../controllers/reportsController.js';

const router = Router();

router.use(protect);
router.get('/', monthIn(query, 'month', { optional: true }), validate, getMonthlyReportData);

export default router;
