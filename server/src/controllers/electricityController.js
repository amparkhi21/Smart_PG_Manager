import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/electricityService.js';

export const getPrefill = asyncHandler(async (req, res) => {
  const result = await service.getPrefill({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const createBill = asyncHandler(async (req, res) => {
  const result = await service.createBill({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.status(201).json({ success: true, ...result });
});

export const listBills = asyncHandler(async (req, res) => {
  const result = await service.listBills({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getBill = asyncHandler(async (req, res) => {
  const result = await service.getBill({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const addBillPayment = asyncHandler(async (req, res) => {
  const { created, ...result } = await service.addBillPayment({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.status(created ? 201 : 200).json({ success: true, ...result });
});
