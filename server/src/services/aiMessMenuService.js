import MessMenu from '../models/MessMenu.js';
import { MEAL_KEYS } from '../constants.js';
import ApiError from '../utils/ApiError.js';
import { offsetDate } from '../utils/aiMenuValidation.js';
import { menuPlanner } from './geminiMenuService.js';

const generating = new Set();

export async function generateMessPlan({ owner, input, planner = menuPlanner, signal }) {
  const key = String(owner._id);
  if (generating.has(key)) throw new ApiError(409, 'A menu plan is already being generated. Please wait.');
  generating.add(key);
  try {
    const menus = await MessMenu.find({ owner: owner._id, date: { $gte: offsetDate(input.date, -14), $lt: input.date } })
      .select('date meals -_id').sort({ date: 1 }).limit(14).lean();
    // Only dates and bounded food names cross the provider boundary.
    const relevantMeals = input.meal === 'all' ? MEAL_KEYS : [input.meal];
    const history = menus.map((menu) => ({ date: menu.date, meals: Object.fromEntries(relevantMeals.map((meal) => [meal,
      (menu.meals?.[meal]?.items || []).slice(0, 8).map((item) => item.slice(0, 120))])) }));
    const result = await planner.generate(input, history, signal);
    return { ...result, mode: input.mode, date: input.date };
  } finally { generating.delete(key); }
}
