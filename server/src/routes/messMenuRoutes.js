import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { isRealDate } from '../utils/dates.js';
import { MEAL_KEYS, SERVING_TIME_RE } from '../models/MessMenu.js';
import { createMessMenu, listMessMenus, getMessMenu, updateMessMenu, deleteMessMenu } from '../controllers/messMenuController.js';

const router = Router();
router.use(protect);
const validDate = (chain) => chain.isString().bail().custom(isRealDate).withMessage('Use a real date in YYYY-MM-DD format');
const mealRules = (update = false) => [
  (update ? body('meals') : body('meals').optional()).isObject({ strict: true }).bail()
    .custom((meals) => Object.keys(meals).every((key) => MEAL_KEYS.includes(key))).withMessage('Use breakfast, lunch, eveningSnacks and dinner'),
  ...MEAL_KEYS.flatMap((key) => [
    body(`meals.${key}`).optional().isObject({ strict: true }).bail()
      .custom((meal) => Object.keys(meal).every((field) => ['items', 'servingTime', 'notes'].includes(field))),
    body(`meals.${key}.items`).optional().isArray({ max: 30 }).withMessage('Use an array of at most 30 food items'),
    body(`meals.${key}.items.*`).isString().bail().trim().notEmpty().isLength({ max: 120 }),
    body(`meals.${key}.servingTime`).optional().isString().bail().trim()
      .custom((value) => value === '' || SERVING_TIME_RE.test(value)).withMessage('Use HH:mm or HH:mm-HH:mm Indian local time'),
    body(`meals.${key}.notes`).optional().isString().bail().trim().isLength({ max: 500 }),
  ]),
];

router.get('/', [validDate(query('from').optional()), validDate(query('to').optional())], validate, listMessMenus);
router.post('/', [validDate(body('date')), ...mealRules()], validate, createMessMenu);
router.get('/:date', validDate(param('date')), validate, getMessMenu);
router.put('/:date', [validDate(param('date')), ...mealRules(true)], validate, updateMessMenu);
router.delete('/:date', validDate(param('date')), validate, deleteMessMenu);
export default router;
