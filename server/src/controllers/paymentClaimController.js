import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/paymentClaimService.js';

export const listMyBills = asyncHandler(async (req, res) => {
  const result = await service.listMyBills({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const getMyPaymentDetails = asyncHandler(async (req, res) => {
  const result = await service.getMyPaymentDetails({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const listMyPaymentHistory = asyncHandler(async (req, res) => {
  const result = await service.listMyPaymentHistory({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const listMyClaims = asyncHandler(async (req, res) => {
  const result = await service.listMyClaims({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const cancelMyClaim = asyncHandler(async (req, res) => {
  const result = await service.cancelMyClaim({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const submitClaim = asyncHandler(async (req, res) => {
  const result = await service.submitClaim({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.status(201).json({ success: true, ...result });
});

export const listClaims = asyncHandler(async (req, res) => {
  const result = await service.listClaims({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const approveClaim = asyncHandler(async (req, res) => {
  const result = await service.approveClaim({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const rejectClaim = asyncHandler(async (req, res) => {
  const result = await service.rejectClaim({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});
