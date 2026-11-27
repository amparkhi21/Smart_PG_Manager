import bcrypt from 'bcryptjs';
import ApiError from '../utils/ApiError.js';
import { validPassword, normalizePhone } from '../utils/residentAuth.js';

export async function applyLoginAccess(resident, input) {
  if (input.loginEnabled === undefined && input.temporaryPassword === undefined) return;
  if (resident.status !== 'Active') throw new ApiError(409, 'Login access is only available for active residents');
  if (input.temporaryPassword !== undefined) {
    if (!validPassword(input.temporaryPassword)) throw new ApiError(400, 'Use a password of at least 8 characters and at most 72 UTF-8 bytes');
    resident.passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
    resident.passwordChangeRequired = true;
    resident.accountStatus = resident.loginEnabled ? 'active' : 'disabled';
  }
  if (input.loginEnabled !== undefined) {
    if (typeof input.loginEnabled !== 'boolean') throw new ApiError(400, 'Login access must be true or false');
    if (input.loginEnabled && (!resident.passwordHash || resident.accountStatus === 'unconfigured')) {
      throw new ApiError(400, 'Set a temporary password to enable login');
    }
    resident.loginEnabled = input.loginEnabled;
    resident.accountStatus = input.loginEnabled ? 'active' : resident.accountStatus === 'unconfigured' ? 'unconfigured' : 'disabled';
  }
  if (resident.accountStatus !== 'unconfigured') {
    resident.normalizedPhone = normalizePhone(resident.phone);
    if (!resident.normalizedPhone) throw new ApiError(400, 'Enter a valid resident phone number');
  }
}
