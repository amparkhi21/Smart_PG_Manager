import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import ComplaintEvent from '../models/ComplaintEvent.js';
import RoomChangeRequest from '../models/RoomChangeRequest.js';
import LeaveRequest from '../models/LeaveRequest.js';
import PaymentClaim from '../models/PaymentClaim.js';
import Notice from '../models/Notice.js';
import Resident from '../models/Resident.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import ApiError from '../utils/ApiError.js';
import { schedulePushDelivery } from './pushNotificationService.js';

const sources = [ComplaintEvent, RoomChangeRequest, LeaveRequest, PaymentClaim, Notice];
const active = { status: 'Active', loginEnabled: true, accountStatus: 'active' };

async function insertRecipients(owner, event, recipients) {
  if (!recipients.length) return;
  const { recipients: ignored, ...data } = event;
  try {
    await Notification.bulkWrite(recipients.map((recipient) => ({ updateOne: {
      filter: { owner, recipientRole: event.recipientRole, recipient, eventKey: event.eventKey },
      update: { $setOnInsert: { ...data, owner, recipient, readAt: null, pushEligible: true, pushHandled: false } }, upsert: true,
    } })), { ordered: false });
  } catch (error) {
    // Simultaneous deliveries can race the unique upsert. Other failures retain the outbox.
    if (error.code !== 11000 || !error.writeErrors?.length || error.writeErrors.some((item) => item.code !== 11000)) throw error;
    const saved = await Notification.countDocuments({ owner, recipientRole: event.recipientRole, eventKey: event.eventKey, recipient: { $in: recipients } });
    if (saved !== recipients.length) throw error;
  }
}

// Called only after business commits, and retried when the recipient uses notification APIs.
// The recipient filter limits work; a notice's entire fixed audience is delivered before acknowledgment.
export async function deliverPendingNotifications(owner, recipientScope) {
  if (!mongoose.isValidObjectId(owner)) throw new Error('A notification PG is required');
  for (const Model of sources) {
    const filter = { owner, 'notificationEvents.0': { $exists: true } };
    if (recipientScope) filter.notificationEvents = { $elemMatch: { recipientRole: recipientScope.recipientRole, recipients: recipientScope.recipient } };
    const cursor = Model.find(filter).select({ owner: 1, notificationEvents: 1 }).lean().cursor();
    try {
      for await (const document of cursor) {
        for (const event of document.notificationEvents) {
          if (recipientScope && (event.recipientRole !== recipientScope.recipientRole || !event.recipients.some((id) => String(id) === String(recipientScope.recipient)))) continue;
          const recipients = event.recipientRole === 'owner' ? event.recipients.filter((id) => String(id) === String(document.owner))
            : (await Resident.find({ owner: document.owner, _id: { $in: event.recipients }, ...(event.type === 'notice_published' && active) }).select('_id').lean()).map((resident) => resident._id);
          await insertRecipients(document.owner, event, recipients);
          // Do not change business timestamps, notice badges or versions while draining delivery metadata.
          await Model.updateOne({ _id: document._id, owner: document.owner }, { $pull: { notificationEvents: { eventKey: event.eventKey } } }, { timestamps: false });
        }
      }
    } finally { await cursor.close(); }
  }
  schedulePushDelivery(owner, recipientScope);
}

export async function tryDeliverNotifications(owner) {
  try { await deliverPendingNotifications(owner); }
  catch { console.warn('Notification delivery deferred; committed events will retry on notification access'); }
}

// Internal hook for a future scheduler. It reads actual scoped bills and never writes balances.
// The scheduled instant is also the occurrence key, making repeated worker calls idempotent.
export async function prepareDueReminder({ owner, resident: residentId, billType, billId, availableAt }) {
  if (![owner, residentId, billId].every((id) => mongoose.isValidObjectId(id)) || !['Rent', 'Electricity'].includes(billType)
    || !(availableAt instanceof Date) || !Number.isFinite(availableAt.getTime())) throw new ApiError(400, 'Invalid reminder details');
  const resident = await Resident.findOne({ _id: residentId, owner, ...active }).select('room').lean();
  if (!resident) throw new ApiError(404, 'Active resident not found in this PG');
  const Model = billType === 'Rent' ? RentRecord : ElectricityBill;
  const bill = await Model.findOne({ _id: billId, owner, balance: { $gt: 0 }, ...(billType === 'Rent' ? { resident: residentId } : { room: resident.room }) }).lean();
  if (!bill) throw new ApiError(404, 'Outstanding bill not found for this resident');
  const type = billType === 'Rent' ? 'rent_due' : 'bill_due';
  const due = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(bill.dueDate);
  const event = notificationEvent(type, bill._id, residentId, `${billType} payment reminder`,
    `${billType === 'Rent' ? 'Your rent' : 'Your shared-room electricity'} bill for ${bill.month} has an outstanding balance of ₹${bill.balance}. Due date: ${due}.`, `${bill._id}:${availableAt.toISOString()}`);
  event.availableAt = availableAt;
  await insertRecipients(owner, event, [resident._id]);
}
