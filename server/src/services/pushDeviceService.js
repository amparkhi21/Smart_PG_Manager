import PushDevice from '../models/PushDevice.js';
import { encryptPushToken, pushAccountScope } from '../utils/pushTokens.js';
import ApiError from '../utils/ApiError.js';

export const registerPushDevice = async (context) => {
  const scope = pushAccountScope(context), deviceId = context.input.deviceId;
  const encrypted = encryptPushToken(context.input.token, { ...scope, deviceId });
  let device;
  try {
    device = await PushDevice.findOneAndUpdate({ ...scope, deviceId }, {
      $set: { ...encrypted, sessionVersion: context.resident?.sessionVersion ?? null },
      $setOnInsert: { ...scope, deviceId, platform: 'android' }, $inc: { revision: 1 },
    }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'This installation or token is already registered. Unregister it from the previous account first.');
    throw new ApiError(503, 'Unable to register this device. Please try again.');
  }
  return { message: 'Push device registered', data: { id: device._id, deviceId: device.deviceId, platform: device.platform } };
};
export const unregisterPushDevice = async (context) => {
  const device = await PushDevice.findOneAndDelete({ _id: context.identifiers.id, ...pushAccountScope(context) });
  if (!device) throw new ApiError(404, 'Push device not found');
  return { message: 'Push device unregistered' };
};
