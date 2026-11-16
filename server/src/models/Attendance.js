import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    // "YYYY-MM-DD" in IST, so day boundaries are never off by timezone
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ['Present', 'Absent', 'On Leave'], required: true },
    note: { type: String, trim: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

attendanceSchema.index({ resident: 1, date: 1 }, { unique: true });
attendanceSchema.index({ owner: 1, date: 1 });

export default mongoose.model('Attendance', attendanceSchema);