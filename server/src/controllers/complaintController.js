import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/complaintService.js';

export const createComplaint = asyncHandler(async (req, res) => {
  const result = await service.createComplaint({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.status(201).json({ success: true, ...result });
});

export const listComplaints = asyncHandler(async (req, res) => {
  const result = await service.listComplaints({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});

export const getComplaint = asyncHandler(async (req, res) => {
  const result = await service.getComplaint({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});

export const getComplaintHistory = asyncHandler(async (req, res) => {
  const result = await service.getComplaintHistory({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});

export const addComplaintComment = asyncHandler(async (req, res) => {
  const result = await service.addComplaintComment({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateComplaintStatus = asyncHandler(async (req, res) => {
  const result = await service.updateComplaintStatus({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});

export const reopenComplaint = asyncHandler(async (req, res) => {
  const result = await service.reopenComplaint({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});
