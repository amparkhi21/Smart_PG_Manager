import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/attendanceService.js';

export const getAttendance = asyncHandler(async (req, res) => {
  const result = await service.getAttendance({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const markAttendance = asyncHandler(async (req, res) => {
  const result = await service.markAttendance({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const getMonthlySummary = asyncHandler(async (req, res) => {
  const result = await service.getMonthlySummary({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
  });
  res.json({ success: true, ...result });
});
