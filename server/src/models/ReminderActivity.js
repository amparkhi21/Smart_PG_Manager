import mongoose from 'mongoose';

const reminderActivitySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    ownerName: { type: String, required: true },
    sourceType: { type: String, enum: ['Rent', 'Electricity'], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    billingMonth: { type: String, required: true },
    reminderType: { type: String, enum: ['Pending Rent', 'Overdue Rent', 'Pending Electricity', 'Overdue Electricity'], required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
    recipientName: { type: String, required: true },
    phone: { type: String, required: true },
    roomNumber: { type: String, required: true },
    status: { type: String, enum: ['Draft', 'WhatsApp opened', 'Owner-reported sent'], default: 'Draft' },
    lastPreparedAt: { type: Date },
    events: [{
      status: { type: String, enum: ['Draft', 'WhatsApp opened', 'Owner-reported sent'], required: true },
      at: { type: Date, default: Date.now },
      ownerName: { type: String, required: true },
    }],
  },
  { timestamps: true }
);

reminderActivitySchema.index({ owner: 1, sourceType: 1, sourceId: 1, recipientId: 1 }, { unique: true });
reminderActivitySchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model('ReminderActivity', reminderActivitySchema);
