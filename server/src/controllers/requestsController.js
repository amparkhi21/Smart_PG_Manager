import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/requestsService.js';

export const listUnifiedRequests = asyncHandler(async (req, res) => {
  const result = await service.listUnifiedRequests({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const getUnifiedRequest = asyncHandler(async (req, res) => {
  const result = await service.getUnifiedRequest({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const createGeneralRequest = asyncHandler(async (req, res) => {
  const result = await service.createGeneralRequest({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateGeneralRequest = asyncHandler(async (req, res) => {
  const result = await service.updateGeneralRequest({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const cancelGeneralRequest = asyncHandler(async (req, res) => {
  const result = await service.cancelGeneralRequest({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});
