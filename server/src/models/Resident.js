import mongoose from 'mongoose';
import { normalizePhone } from '../utils/residentAuth.js';

const hideCredentials = (doc, value) => {
  delete value.passwordHash;
  delete value.sessionVersion;
  delete value.activationInvitations;
  return value;
};

const residentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    role: { type: String, enum: ['resident'], default: 'resident', immutable: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    bedNumber: { type: String, trim: true, maxlength: 20 },
    bedAssignments: [{
      room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
      roomNumber: { type: String, required: true, maxlength: 20 },
      bedNumber: { type: String, required: true, maxlength: 20 },
      assignedAt: { type: Date, required: true },
      releasedAt: { type: Date },
    }],
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 80 },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      validate: { validator: (value) => Boolean(normalizePhone(value)) || /^\+?[0-9]{10,13}$/.test(value), message: 'Enter a valid phone number' },
    },
    email: { type: String, trim: true, lowercase: true },
    joiningDate: { type: Date, required: true, default: Date.now },
    monthlyRent: { type: Number, required: true, min: 0 },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    status: { type: String, enum: ['Active', 'Left'], default: 'Active' },
    leftDate: { type: Date },
    // Optional authentication fields: legacy residents need no backfill.
    normalizedPhone: { type: String },
    passwordHash: { type: String, select: false },
    loginEnabled: { type: Boolean, default: false },
    accountStatus: { type: String, enum: ['unconfigured', 'active', 'disabled'], default: 'unconfigured' },
    sessionVersion: { type: Number, default: 0 },
    passwordChangeRequired: { type: Boolean, default: false },
    // Stored on the resident so single-use activation and account creation can be
    // consumed in one atomic document update, including on standalone MongoDB.
    activationInvitations: { type: [{
      codeHash: { type: String, required: true },
      room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
      roomNumber: { type: String, required: true, maxlength: 20 },
      bedNumber: { type: String, required: true, maxlength: 20 },
      expiresAt: { type: Date, required: true },
      createdAt: { type: Date, required: true, default: Date.now },
      usedAt: { type: Date, default: null },
      revokedAt: { type: Date, default: null },
    }], select: false, default: undefined },
    firstLoginAt: { type: Date },
    lastLoginAt: { type: Date },
    noticeSeenAt: { type: Date },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true,
    toJSON: { transform: hideCredentials }, toObject: { transform: hideCredentials } }
);

// Residents are never hard-deleted by default: mark them "Left" to keep history.
residentSchema.index({ owner: 1, status: 1 });
residentSchema.index({ owner: 1, room: 1 });
// Reserve phone identifiers only for configured accounts; legacy duplicates survive.
residentSchema.index({ owner: 1, normalizedPhone: 1 }, {
  unique: true, name: 'resident_login_phone_per_pg',
  partialFilterExpression: { normalizedPhone: { $type: 'string' } },
});

residentSchema.pre('save', function () {
  if (this.accountStatus !== 'unconfigured') this.normalizedPhone = normalizePhone(this.phone);
  if (this.status === 'Left') {
    this.loginEnabled = false;
    if (this.accountStatus !== 'unconfigured') this.accountStatus = 'disabled';
  }
  if (!this.isNew && ['passwordHash', 'loginEnabled', 'phone', 'status', 'room'].some((key) => this.isModified(key))) {
    this.sessionVersion = (this.sessionVersion || 0) + 1;
  }
});

export default mongoose.model('Resident', residentSchema);
