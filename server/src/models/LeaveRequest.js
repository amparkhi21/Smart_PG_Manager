import mongoose from 'mongoose';
import { isRealDate } from '../utils/dates.js';
import { notificationOutbox } from './notificationOutbox.js';

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
export const ACTIVE_LEAVE_STATUSES = ['Pending', 'Approved'];
export const leaveDurationDays = (fromDate, toDate) => (new Date(`${toDate}T00:00:00Z`) - new Date(`${fromDate}T00:00:00Z`)) / 86400000 + 1;

const historySchema = new mongoose.Schema({
  status: { type: String, enum: LEAVE_STATUSES, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorRole: { type: String, enum: ['owner', 'resident'], required: true },
  actorName: { type: String, required: true, maxlength: 80 },
  response: { type: String, trim: true, maxlength: 1000, default: '' },
  createdAt: { type: Date, default: Date.now, immutable: true },
});
const leaveRequestSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true, immutable: true },
  residentName: { type: String, required: true, maxlength: 80, immutable: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, immutable: true },
  roomNumber: { type: String, required: true, immutable: true },
  bedNumber: { type: String, maxlength: 20, default: null, immutable: true },
  fromDate: { type: String, required: true, immutable: true, validate: isRealDate },
  toDate: { type: String, required: true, immutable: true, validate: isRealDate },
  durationDays: { type: Number, required: true, min: 1, max: 365, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 2000, immutable: true },
  emergencyContact: { type: String, trim: true, maxlength: 16, default: '', immutable: true, match: /^(?:\+?[0-9]{10,15})?$/ },
  status: { type: String, enum: LEAVE_STATUSES, default: 'Pending' },
  response: { type: String, trim: true, maxlength: 1000, default: '' },
  decidedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  // A request has one creation and one finalization, so embedded history is bounded.
  history: { type: [historySchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
leaveRequestSchema.index({ owner: 1, resident: 1, status: 1, fromDate: 1, toDate: 1 });
leaveRequestSchema.index({ owner: 1, status: 1, fromDate: 1 });
leaveRequestSchema.index({ owner: 1, resident: 1, createdAt: -1, _id: -1 });
leaveRequestSchema.plugin(notificationOutbox);

// Serialize leave scheduling without modifying resident/account/financial records.
const scheduleLockSchema = new mongoose.Schema({
  _id: String,
  owner: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  resident: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  revision: { type: Number, default: 0 },
}, { versionKey: false });
export const LeaveScheduleLock = mongoose.model('LeaveScheduleLock', scheduleLockSchema);
export default mongoose.model('LeaveRequest', leaveRequestSchema);
