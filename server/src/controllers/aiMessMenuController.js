import MessMenu, { MEAL_KEYS } from '../models/MessMenu.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { menuPlanner, offsetDate, plannerInput } from '../utils/aiMessPlanner.js';

const generating = new Set();
export const generateMessPlan = asyncHandler(async (req, res) => {
  const input = plannerInput(req.body), owner = String(req.owner._id);
  if (generating.has(owner)) throw new ApiError(409, 'A menu plan is already being generated. Please wait.');
  generating.add(owner);
  const controller = new AbortController();
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', closed);
  try {
    const menus = await MessMenu.find({ owner: req.owner._id, date: { $gte: offsetDate(input.date, -14), $lt: input.date } })
      .select('date meals -_id').sort({ date: 1 }).limit(14).lean();
    // Only dates and bounded food names cross the provider boundary. No PG IDs,
    // owner/resident details, serving notes, credentials or arbitrary documents.
    const relevantMeals = input.meal === 'all' ? MEAL_KEYS : [input.meal];
    const history = menus.map((menu) => ({ date: menu.date, meals: Object.fromEntries(relevantMeals.map((key) => [key, (menu.meals?.[key]?.items || []).slice(0, 8).map((item) => item.slice(0, 120))])) }));
    const result = await (req.app.locals.messAIPlanner || menuPlanner).generate(input, history, controller.signal);
    res.json({ success: true, data: { ...result, mode: input.mode, date: input.date } });
  } catch (error) {
    // These errors contain only our fixed messages; production's generic 5xx
    // handler would otherwise hide the actionable missing-key/quota guidance.
    if (error instanceof ApiError) {
      const timing = error.timing && {
        elapsedMs: error.timing.elapsedMs, attempts: error.timing.attempts,
        attemptTimeoutMs: error.timing.attemptTimeoutMs, totalTimeoutMs: error.timing.totalTimeoutMs,
        ...(error.timing.lastProviderStatus && { lastProviderStatus: error.timing.lastProviderStatus }),
        ...(error.timing.timeoutSource && { timeoutSource: error.timing.timeoutSource }),
      };
      if (error.code) console.warn('AI menu generation failed', { code: error.code, status: error.statusCode,
        ...(error.providerStatus && { providerStatus: error.providerStatus }), ...(timing && { timing }) });
      if (!res.destroyed) res.status(error.statusCode).json({ success: false, message: error.message,
        ...(error.code && { code: error.code }), ...(error.providerStatus && { providerStatus: error.providerStatus }),
        ...(timing && { timing }),
      });
    }
    else throw error;
  } finally { generating.delete(owner); res.removeListener('close', closed); }
});
