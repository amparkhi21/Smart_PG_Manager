import mongoose from 'mongoose';
import { notificationOutbox } from './notificationOutbox.js';

const roomChangeRequestSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true, immutable: true },
  residentName: { type: String, required: true, immutable: true },
  fromRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, immutable: true },
  toRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, immutable: true },
  fromRoomNumber: { type: String, required: true, immutable: true },
  toRoomNumber: { type: String, required: true, immutable: true },
  reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000, immutable: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  decisionNote: { type: String, trim: true, maxlength: 500 },
  decidedAt: Date,
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
}, { timestamps: true, optimisticConcurrency: true });

roomChangeRequestSchema.index({ owner: 1, resident: 1 }, {
  unique: true, partialFilterExpression: { status: 'Pending' }, name: 'one_pending_room_change_per_resident',
});
roomChangeRequestSchema.index({ owner: 1, status: 1, createdAt: -1 });
roomChangeRequestSchema.index({ owner: 1, resident: 1, createdAt: -1 });
roomChangeRequestSchema.plugin(notificationOutbox);
export default mongoose.model('RoomChangeRequest', roomChangeRequestSchema);
