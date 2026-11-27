import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { plannerInput } from '../utils/aiMenuValidation.js';
import { generateMessPlan as generatePlan } from '../services/aiMessMenuService.js';

export const generateMessPlan = asyncHandler(async (req, res) => {
  const input = plannerInput(req.body);
  const controller = new AbortController();
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', closed);
  try {
    const result = await generatePlan({ owner: req.owner, input, planner: req.app.locals.messAIPlanner, signal: controller.signal });
    res.json({ success: true, data: result });
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
  } finally { res.removeListener('close', closed); }
});
