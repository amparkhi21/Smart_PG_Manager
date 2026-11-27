import mongoose from 'mongoose';
import { NOTIFICATION_TARGETS } from '../constants.js';

const eventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, maxlength: 160 },
  type: { type: String, enum: Object.keys(NOTIFICATION_TARGETS), required: true },
  recipientRole: { type: String, enum: ['owner', 'resident'], required: true },
  recipients: { type: [mongoose.Schema.Types.ObjectId], required: true, validate: (ids) => ids.length > 0 },
  relatedEntityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 1000 },
  path: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, required: true },
  availableAt: { type: Date, required: true },
}, { _id: false });

// Embedded in the business/audit write, so a committed action cannot lose its event.
// No migration or retroactive notifications for existing records.
export function notificationOutbox(schema) {
  schema.add({ notificationEvents: { type: [eventSchema], default: undefined, select: false } });
  schema.index({ owner: 1, 'notificationEvents.recipients': 1 }, {
    partialFilterExpression: { 'notificationEvents.0': { $exists: true } },
  });
}

export function notificationEvent(type, entityId, recipients, title, message, eventId = entityId) {
  if (!Object.hasOwn(NOTIFICATION_TARGETS, type)) throw new Error('Unsupported notification event');
  const target = NOTIFICATION_TARGETS[type];
  const ids = [...new Map((Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean).map((id) => [String(id), id])).values()];
  if (!ids.length) return null;
  const now = new Date();
  return { eventKey: `${type}:${eventId}`, type, relatedEntityId: entityId, recipientRole: target[0], recipients: ids,
    title: title.slice(0, 160), message: message.slice(0, 1000), path: target[1], createdAt: now, availableAt: now };
}
