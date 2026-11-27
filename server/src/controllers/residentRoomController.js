import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/residentRoomService.js';

export const getMyRoom = asyncHandler(async (req, res) => {
  const result = await service.getMyRoom({ owner: req.owner, resident: req.resident, filters: req.query });
  res.json({ success: true, ...result });
});

export const getRoomAvailability = asyncHandler(async (req, res) => {
  const result = await service.getRoomAvailability({ owner: req.owner, resident: req.resident, filters: req.query });
  res.json({ success: true, ...result });
});
