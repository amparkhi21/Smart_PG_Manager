import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/settingsService.js';

export const getSettings = asyncHandler(async (req, res) => {
  const result = await service.getSettings({ owner: req.owner, resident: req.resident, input: req.body });
  res.json({ success: true, ...result });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const result = await service.updateSettings({ owner: req.owner, resident: req.resident, input: req.body });
  res.json({ success: true, ...result });
});
