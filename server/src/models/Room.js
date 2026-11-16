import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    roomNumber: { type: String, required: [true, 'Room number is required'], trim: true },
    floor: { type: String, trim: true },
    monthlyRent: { type: Number, required: [true, 'Monthly rent is required'], min: 0 },
    capacity: { type: Number, required: true, min: 1, default: 1 },
    // Latest meter reading entered; used as "previous reading" for the next bill
    lastMeterReading: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Occupied/Vacant status and current residents are derived from active residents.
roomSchema.index({ owner: 1, roomNumber: 1 }, { unique: true });

export default mongoose.model('Room', roomSchema);