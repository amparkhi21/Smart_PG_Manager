import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/reportsService.js';

export const getMonthlyReportData = asyncHandler(async (req, res) => {
  const result = await service.getMonthlyReportData({ owner: req.owner, resident: req.resident, filters: req.query });
  res.json({ success: true, ...result });
});
