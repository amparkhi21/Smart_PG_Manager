import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/roomChangeService.js';

export const createRoomChange = asyncHandler(async (req, res) => {
  const result = await service.createRoomChange({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.status(201).json({ success: true, ...result });
});

export const listRoomChanges = asyncHandler(async (req, res) => {
  const result = await service.listRoomChanges({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const decideRoomChange = asyncHandler(async (req, res) => {
  const result = await service.decideRoomChange({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const cancelRoomChangeRequest = asyncHandler(async (req, res) => {
  const result = await service.cancelRoomChangeRequest({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});
