import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/dashboardService.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const result = await service.getDashboard({ owner: req.owner, resident: req.resident, filters: req.query });
  res.json({ success: true, ...result });
});
