import PushDevice from '../models/PushDevice.js';
import { encryptPushToken, pushAccountScope } from '../utils/pushTokens.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const registerPushDevice = asyncHandler(async (req, res) => {
  const scope = pushAccountScope(req), deviceId = req.body.deviceId;
  const encrypted = encryptPushToken(req.body.token, { ...scope, deviceId });
  let device;
  try {
    device = await PushDevice.findOneAndUpdate({ ...scope, deviceId }, {
      $set: { ...encrypted, sessionVersion: req.resident?.sessionVersion ?? null },
      $setOnInsert: { ...scope, deviceId, platform: 'android' }, $inc: { revision: 1 },
    }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'This installation or token is already registered. Unregister it from the previous account first.');
    throw new ApiError(503, 'Unable to register this device. Please try again.');
  }
  res.json({ success: true, message: 'Push device registered', data: { id: device._id, deviceId: device.deviceId, platform: device.platform } });
});
export const unregisterPushDevice = asyncHandler(async (req, res) => {
  const device = await PushDevice.findOneAndDelete({ _id: req.params.id, ...pushAccountScope(req) });
  if (!device) throw new ApiError(404, 'Push device not found');
  res.json({ success: true, message: 'Push device unregistered' });
});
