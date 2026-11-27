import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/residentPortalService.js';

export const getResidentDashboard = asyncHandler(async (req, res) => {
  const result = await service.getResidentDashboard({
    owner: req.owner,
    resident: req.resident,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getResidentOwnProfile = asyncHandler(async (req, res) => {
  const result = await service.getResidentOwnProfile({
    owner: req.owner,
    resident: req.resident,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getResidentAttendance = asyncHandler(async (req, res) => {
  const result = await service.getResidentAttendance({
    owner: req.owner,
    resident: req.resident,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});
