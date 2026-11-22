import mongoose from 'mongoose';

export const NOTIFICATION_TARGETS = {
  complaint_created: ['owner', '/requests'],
  complaint_status_updated: ['resident', '/resident/requests'],
  complaint_response: ['resident', '/resident/requests'],
  room_change_requested: ['owner', '/room-change-requests'],
  room_change_approved: ['resident', '/resident/room-change-requests'],
  room_change_rejected: ['resident', '/resident/room-change-requests'],
  leave_requested: ['owner', '/leave-requests'],
  leave_approved: ['resident', '/resident/leave-requests'],
  leave_rejected: ['resident', '/resident/leave-requests'],
  payment_claim_submitted: ['owner', '/payment-requests'],
  payment_approved: ['resident', '/resident/payments'],
  payment_rejected: ['resident', '/resident/payments'],
  notice_published: ['resident', '/resident/notices'],
  rent_due: ['resident', '/resident/payments'],
  bill_due: ['resident', '/resident/payments'],
};

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  recipientRole: { type: String, enum: ['owner', 'resident'], required: true, immutable: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  eventKey: { type: String, required: true, maxlength: 160, immutable: true, select: false },
  type: { type: String, enum: Object.keys(NOTIFICATION_TARGETS), required: true, immutable: true },
  title: { type: String, required: true, maxlength: 160, immutable: true },
  message: { type: String, required: true, maxlength: 1000, immutable: true },
  relatedEntityId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  path: { type: String, maxlength: 200, immutable: true, match: /^\/(?!\/)[a-z0-9/-]*$/ },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true },
  // Future workers can prepare reminders without making them visible early.
  availableAt: { type: Date, default: Date.now, immutable: true },
  pushEligible: { type: Boolean, default: false, select: false },
  pushHandled: { type: Boolean, default: false, select: false },
}, { versionKey: false });
schema.index({ owner: 1, recipientRole: 1, recipient: 1, eventKey: 1 }, { unique: true });
schema.index({ owner: 1, recipientRole: 1, recipient: 1, createdAt: -1, _id: -1 });
schema.index({ owner: 1, recipientRole: 1, recipient: 1, readAt: 1, availableAt: 1 });
schema.index({ pushEligible: 1, pushHandled: 1, availableAt: 1, createdAt: 1 });
export default mongoose.model('Notification', schema);
