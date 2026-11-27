import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/authService.js';

export const register = asyncHandler(async (req, res) => {
  const result = await service.register({ owner: req.owner, resident: req.resident, input: req.body });
  res.status(201).json({ success: true, ...result });
});

export const login = asyncHandler(async (req, res) => {
  const result = await service.login({ owner: req.owner, resident: req.resident, input: req.body });
  res.json({ success: true, ...result });
});

export const getMe = asyncHandler(async (req, res) => {
  const result = await service.getMe({ owner: req.owner, resident: req.resident, input: req.body });
  res.json({ success: true, ...result });
});
