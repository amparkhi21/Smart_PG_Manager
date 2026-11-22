import { createHash, randomBytes } from 'node:crypto';

export const generateActivationCode = () => randomBytes(32).toString('base64url');
export const activationCodeHash = (code) => createHash('sha256').update(code, 'utf8').digest('hex');
