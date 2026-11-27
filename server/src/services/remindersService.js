import ElectricityBill from '../models/ElectricityBill.js';
import ReminderActivity from '../models/ReminderActivity.js';
import RentRecord from '../models/RentRecord.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';

import { refreshOverdue } from './billingService.js';

const maskPhone = (phone) => `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;

const activityResponse = (activity, duplicateWarning = false) => ({
  _id: activity._id,
  sourceType: activity.sourceType,
  sourceId: activity.sourceId,
  billingMonth: activity.billingMonth,
  reminderType: activity.reminderType,
  recipientId: activity.recipientId,
  recipientName: activity.recipientName,
  phone: maskPhone(activity.phone),
  roomNumber: activity.roomNumber,
  status: activity.status,
  events: activity.events,
  duplicateWarning,
});

export const listReminderActivity = async (context) => {
  const ownerId = context.owner._id;
  await Promise.all([refreshOverdue(RentRecord, ownerId), refreshOverdue(ElectricityBill, ownerId)]);

  const filter = { owner: ownerId };
  if (context.filters.month) filter.billingMonth = context.filters.month;
  if (context.filters.type) filter.sourceType = context.filters.type;
  const activities = await ReminderActivity.find(filter).sort({ updatedAt: -1 }).limit(100);
  const data = activities.flatMap((activity) =>
    activity.events.map((event) => ({
      ...activityResponse(activity),
      status: event.status,
      eventAt: event.at,
      ownerName: event.ownerName,
    }))
  ).sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt));

  return { count: data.length, data };
};

export const createReminderDraft = async (context) => {
  const { sourceType, sourceId, recipientId } = context.input;
  const ownerId = context.owner._id;

  let bill;
  let recipient;
  let room;
  if (sourceType === 'Rent') {
    await refreshOverdue(RentRecord, ownerId);
    bill = await RentRecord.findOne({ _id: sourceId, owner: ownerId })
      .populate({ path: 'resident', select: 'fullName phone status room' })
      .populate({ path: 'room', select: 'roomNumber' });
    if (!bill) throw new ApiError(404, 'Rent record not found');
    if (String(bill.resident?._id) !== recipientId) throw new ApiError(400, 'Recipient does not match this rent record');
    recipient = bill.resident;
    room = bill.room;
    if (recipient.status !== 'Active') throw new ApiError(409, 'Reminders are not available for former residents');
    if (bill.balance <= 0) throw new ApiError(409, 'This rent record is already paid');
  } else {
    await refreshOverdue(ElectricityBill, ownerId);
    bill = await ElectricityBill.findOne({ _id: sourceId, owner: ownerId }).populate({ path: 'room', select: 'roomNumber' });
    if (!bill) throw new ApiError(404, 'Electricity bill not found');
    if (bill.balance <= 0) throw new ApiError(409, 'This electricity bill is already paid');
    recipient = await Resident.findOne({ _id: recipientId, owner: ownerId, room: bill.room._id, status: 'Active' });
    if (!recipient) throw new ApiError(400, 'Choose an active resident currently assigned to this room');
    room = bill.room;
  }

  if (!recipient.phone || !/^\+?[0-9]{10,13}$/.test(recipient.phone)) {
    throw new ApiError(400, 'The selected resident does not have a valid phone number');
  }

  const statusPrefix = bill.status === 'Overdue' ? 'Overdue' : 'Pending';
  const reminderType = `${statusPrefix} ${sourceType}`;
  const warningHours = context.owner.reminderSettings?.duplicateWarningHours || 24;
  const cutoff = new Date(Date.now() - warningHours * 60 * 60 * 1000);
  const now = new Date();

  let activity = await ReminderActivity.findOne({ owner: ownerId, sourceType, sourceId, recipientId });
  if (activity) {
    const lastEvent = activity.events[activity.events.length - 1];
    const recipientChanged = activity.phone !== recipient.phone ||
      activity.recipientName !== recipient.fullName ||
      activity.roomNumber !== room.roomNumber;
    const lastPreparedAt = activity.lastPreparedAt || lastEvent?.at;
    if (lastPreparedAt && new Date(lastPreparedAt) >= cutoff && !recipientChanged) {
      return { created: false, ...{ duplicateWarning: true, data: activityResponse(activity, true) } };
    }
    const updateFilter = { _id: activity._id, owner: ownerId };
    if (activity.lastPreparedAt) updateFilter.lastPreparedAt = activity.lastPreparedAt;
    else updateFilter.lastPreparedAt = { $exists: false };
    const prepared = await ReminderActivity.findOneAndUpdate(
      updateFilter,
      {
        $set: {
          billingMonth: bill.month,
          reminderType,
          recipientName: recipient.fullName,
          phone: recipient.phone,
          roomNumber: room.roomNumber,
          status: 'Draft',
          lastPreparedAt: now,
        },
        $push: { events: { status: 'Draft', at: now, ownerName: context.owner.name } },
      },
      { new: true, runValidators: true }
    );
    if (!prepared) {
      activity = await ReminderActivity.findOne({ _id: activity._id, owner: ownerId });
      return { created: false, ...{ duplicateWarning: true, data: activityResponse(activity, true) } };
    }
    return { created: true, ...{ duplicateWarning: false, data: activityResponse(prepared) } };
  }

  try {
    activity = await ReminderActivity.create({
      owner: ownerId,
      ownerName: context.owner.name,
      sourceType,
      sourceId: bill._id,
      billingMonth: bill.month,
      reminderType,
      recipientId: recipient._id,
      recipientName: recipient.fullName,
      phone: recipient.phone,
      roomNumber: room.roomNumber,
      status: 'Draft',
      lastPreparedAt: now,
      events: [{ status: 'Draft', at: now, ownerName: context.owner.name }],
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    activity = await ReminderActivity.findOne({ owner: ownerId, sourceType, sourceId, recipientId });
    if (!activity) throw error;
    return { created: false, ...{ duplicateWarning: true, data: activityResponse(activity, true) } };
  }

  return { created: true, ...{ duplicateWarning: false, data: activityResponse(activity) } };
};

export const updateReminderActivity = async (context) => {
  let _serviceOutcome;
  const activity = await ReminderActivity.findOne({ _id: context.identifiers.id, owner: context.owner._id });
  if (!activity) throw new ApiError(404, 'Reminder activity not found');

  if (context.input.action === 'opened') {
    const Model = activity.sourceType === 'Rent' ? RentRecord : ElectricityBill;
    await refreshOverdue(Model, context.owner._id);
    const bill = await Model.findOne({ _id: activity.sourceId, owner: context.owner._id });
    const recipient = await Resident.findOne({
      _id: activity.recipientId,
      owner: context.owner._id,
      status: 'Active',
      ...(activity.sourceType === 'Rent' ? {} : { room: bill?.room }),
    });
    if (!bill || bill.balance <= 0 || !recipient || recipient.phone !== activity.phone) {
      throw new ApiError(409, 'This reminder is no longer eligible. The bill may be paid or the resident may no longer be active in the room.');
    }
    if (activity.status === 'WhatsApp opened') {
      return { data: activityResponse(activity) };
    }
    if (activity.status !== 'Draft') {
      throw new ApiError(409, 'Prepare a new reminder before opening WhatsApp again');
    }
    const updated = await ReminderActivity.findOneAndUpdate(
      { _id: activity._id, owner: context.owner._id, status: 'Draft' },
      {
        $set: { status: 'WhatsApp opened' },
        $push: { events: { status: 'WhatsApp opened', at: new Date(), ownerName: context.owner.name } },
      },
      { new: true, runValidators: true }
    );
    if (updated) return { data: activityResponse(updated) };
    const current = await ReminderActivity.findOne({ _id: activity._id, owner: context.owner._id });
    if (current?.status === 'WhatsApp opened') return { data: activityResponse(current) };
    throw new ApiError(409, 'Prepare a new reminder before opening WhatsApp again');
  }

  const updated = await ReminderActivity.findOneAndUpdate(
    { _id: activity._id, owner: context.owner._id, status: 'WhatsApp opened' },
    {
      $set: { status: 'Owner-reported sent' },
      $push: { events: { status: 'Owner-reported sent', at: new Date(), ownerName: context.owner.name } },
    },
    { new: true, runValidators: true }
  );
  if (updated) {
    return { data: activityResponse(updated) };
  }
  const current = await ReminderActivity.findOne({ _id: activity._id, owner: context.owner._id });
  if (current?.status === 'Owner-reported sent') {
    return { data: activityResponse(current) };
  }
  throw new ApiError(409, 'WhatsApp must be opened before confirming a reminder as owner-reported sent');

  return _serviceOutcome;
};
