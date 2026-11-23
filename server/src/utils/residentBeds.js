import Resident from '../models/Resident.js';
import ApiError from './ApiError.js';
import { escapeRegex } from './ownership.js';

export function resolveBedNumber(room, value, { required = false } = {}) {
  const bedNumbers = room.bedNumbers || [];
  const requested = typeof value === 'string' ? value.trim() : '';
  if (!bedNumbers.length) {
    if (requested || required) throw new ApiError(400, 'Configure bed numbers for this room before assigning a resident');
    return undefined;
  }
  if (!requested) {
    if (required) throw new ApiError(400, 'Choose a bed in this room');
    return undefined;
  }
  const bedNumber = bedNumbers.find((bed) => bed.toLocaleLowerCase() === requested.toLocaleLowerCase());
  if (!bedNumber) throw new ApiError(400, 'Choose a configured bed in this room');
  return bedNumber;
}

export async function assertBedAvailable(ownerId, room, bedNumber, excludeResidentId, session) {
  if (!bedNumber) return;
  const filter = { owner: ownerId, room: room._id, bedNumber: new RegExp(`^${escapeRegex(bedNumber)}$`, 'i'), status: 'Active' };
  if (excludeResidentId) filter._id = { $ne: excludeResidentId };
  let query = Resident.exists(filter);
  if (session) query = query.session(session);
  if (await query) throw new ApiError(409, `Bed ${bedNumber} in room ${room.roomNumber} is already assigned`);
}

// Keep an append-only assignment history while updating only the current
// resident/room assignment used by occupancy checks.
export function setResidentBed(resident, previousRoom, nextRoom, nextBedNumber) {
  const previousBed = resident.bedNumber || undefined;
  const sameRoom = previousRoom && String(previousRoom._id) === String(nextRoom._id);
  if (sameRoom && previousBed === nextBedNumber) return;

  const now = new Date();
  if (previousBed && previousRoom) {
    const openAssignment = [...(resident.bedAssignments || [])].reverse().find((item) => !item.releasedAt);
    if (openAssignment) openAssignment.releasedAt = now;
    else resident.bedAssignments.push({
      room: previousRoom._id,
      roomNumber: previousRoom.roomNumber,
      bedNumber: previousBed,
      assignedAt: resident.updatedAt || resident.joiningDate || now,
      releasedAt: now,
    });
  }

  resident.room = nextRoom._id;
  if (nextBedNumber) {
    resident.bedNumber = nextBedNumber;
    resident.bedAssignments.push({ room: nextRoom._id, roomNumber: nextRoom.roomNumber, bedNumber: nextBedNumber, assignedAt: now });
  } else {
    resident.set('bedNumber', undefined);
  }
}

export function validateBedNumbers(bedNumbers, capacity) {
  if (bedNumbers === undefined) return;
  if (!Array.isArray(bedNumbers) || bedNumbers.length > 20 || bedNumbers.length !== capacity) {
    throw new ApiError(400, 'Configure exactly one bed number for each room capacity slot');
  }
  const normalized = bedNumbers.map((value) => typeof value === 'string' ? value.trim() : '');
  if (normalized.some((value) => !value || value.length > 20)) throw new ApiError(400, 'Enter bed numbers up to 20 characters each');
  if (new Set(normalized.map((value) => value.toLocaleLowerCase())).size !== normalized.length) {
    throw new ApiError(400, 'Bed numbers must be unique within the room');
  }
}
