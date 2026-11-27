import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/leaveRequestService.js';

export const createLeaveRequest = asyncHandler(async (req, res) => {
  const result = await service.createLeaveRequest({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.status(201).json({ success: true, ...result });
});

export const listLeaveRequests = asyncHandler(async (req, res) => {
  const result = await service.listLeaveRequests({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getLeaveRequest = asyncHandler(async (req, res) => {
  const result = await service.getLeaveRequest({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const cancelLeaveRequest = asyncHandler(async (req, res) => {
  const result = await service.cancelLeaveRequest({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const decideLeaveRequest = asyncHandler(async (req, res) => {
  const result = await service.decideLeaveRequest({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});
