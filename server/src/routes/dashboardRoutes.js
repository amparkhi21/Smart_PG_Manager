import { Router } from 'express';
import { query } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { monthIn } from '../middlewares/validators.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = Router();
router.use(protect);
router.get('/', monthIn(query, 'month', { optional: true, allowFuture: true }), validate, getDashboard);

export default router;