import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import ApiError from './ApiError.js';

export const pushAccountScope = (req) => req.owner ? { owner: req.owner._id, recipientRole: 'owner', recipient: req.owner._id }
  : { owner: req.resident.owner, recipientRole: 'resident', recipient: req.resident._id };
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
function key() {
  if (!/^[a-f\d]{64}$/i.test(process.env.FCM_TOKEN_ENCRYPTION_KEY || '')) throw new ApiError(503, 'Push registration is unavailable. Configure FCM_TOKEN_ENCRYPTION_KEY.');
  return Buffer.from(process.env.FCM_TOKEN_ENCRYPTION_KEY, 'hex');
}
const associatedData = (device) => Buffer.from(`${device.owner}:${device.recipientRole}:${device.recipient}:${device.deviceId}`);
export function encryptPushToken(token, device) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(associatedData(device));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { tokenHash: tokenHash(token), tokenCiphertext: ciphertext.toString('base64'), tokenIv: iv.toString('hex'), tokenTag: cipher.getAuthTag().toString('hex') };
}
export function decryptPushToken(device) {
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(device.tokenIv, 'hex'));
  decipher.setAAD(associatedData(device)); decipher.setAuthTag(Buffer.from(device.tokenTag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(device.tokenCiphertext, 'base64')), decipher.final()]).toString('utf8');
}
