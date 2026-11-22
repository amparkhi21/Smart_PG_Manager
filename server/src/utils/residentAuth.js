import bcrypt from 'bcryptjs';
import ApiError from './ApiError.js';

// India is the existing product's default. Other countries require +country code.
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{9,14}$/.test(compact)) return compact;
  return null;
}

export const validPassword = (value) => typeof value === 'string'
  && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;

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

export function publicResident(resident, owner, room) {
  return {
    id: resident._id, role: 'resident', fullName: resident.fullName,
    phone: resident.phone, email: resident.email || '', joiningDate: resident.joiningDate,
    status: resident.status, loginEnabled: resident.loginEnabled,
    accountStatus: resident.accountStatus, firstLoginAt: resident.firstLoginAt || null,
    lastLoginAt: resident.lastLoginAt || null, passwordChangeRequired: resident.passwordChangeRequired,
    bedNumber: resident.bedNumber || null,
    pgName: owner.pgName, pgId: String(owner._id),
    room: { id: room._id, roomNumber: room.roomNumber },
  };
}
