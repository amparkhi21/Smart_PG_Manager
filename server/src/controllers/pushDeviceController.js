import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/pushDeviceService.js';

export const registerPushDevice = asyncHandler(async (req, res) => {
  const result = await service.registerPushDevice({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const unregisterPushDevice = asyncHandler(async (req, res) => {
  const result = await service.unregisterPushDevice({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});
