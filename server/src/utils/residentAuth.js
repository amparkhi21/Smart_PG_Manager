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
