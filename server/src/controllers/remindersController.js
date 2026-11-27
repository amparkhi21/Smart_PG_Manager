import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/remindersService.js';

export const listReminderActivity = asyncHandler(async (req, res) => {
  const result = await service.listReminderActivity({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const createReminderDraft = asyncHandler(async (req, res) => {
  const { created, ...result } = await service.createReminderDraft({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.status(created ? 201 : 200).json({ success: true, ...result });
});

export const updateReminderActivity = asyncHandler(async (req, res) => {
  const result = await service.updateReminderActivity({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});
