import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/residentAuthService.js';
import { validationResult } from 'express-validator';

export const residentHostels = asyncHandler(async (req, res) => {
  const result = await service.residentHostels({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});

export const residentLogin = asyncHandler(async (req, res) => {
  const result = await service.residentLogin({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
    credentialsValid: validationResult(req).isEmpty(),
  });
  res.json({ success: true, ...result });
});

export const residentMe = asyncHandler(async (req, res) => {
  const result = await service.residentMe({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});

export const changeResidentPassword = asyncHandler(async (req, res) => {
  const result = await service.changeResidentPassword({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    residentOwner: req.residentOwner,
    residentRoom: req.residentRoom,
  });
  res.json({ success: true, ...result });
});
