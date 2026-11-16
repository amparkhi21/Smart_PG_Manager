import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Owner from '../models/Owner.js';
import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import Attendance from '../models/Attendance.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import { currentMonthIST, todayIST, dueDateFor } from '../utils/dates.js';

const DEMO_EMAIL = 'demo@smartpg.test';
const DEMO_PASSWORD = 'Demo@1234';
const RATE = 8;

// room, resident, rent, joined, prev meter, current meter, rent paid, electricity paid
const DEMO = [
  ['101', 'Rohit Verma', 5000, '2026-01-10', 1180, 1236, 0, 0],
  ['102', 'Aman Gupta', 5500, '2026-02-01', 990, 1051, 5500, 0],
  ['103', 'Neha Singh', 6000, '2026-03-15', 1240, 1312, 0, 0],
  ['104', 'Karan Mehta', 5000, '2026-04-01', 870, 912, 5000, 336],
  ['201', 'Priya Nair', 6500, '2026-05-20', 1402, 1466, 0, 0],
  ['202', 'Sahil Khan', 5500, '2026-06-05', 760, 801, 2000, 0],
];

async function run() {
  await connectDB();

  // Remove only the demo account's data. Real owners are never touched.
  const old = await Owner.findOne({ email: DEMO_EMAIL });
  if (old) {
    await Promise.all(
      [Room, Resident, Attendance, RentRecord, ElectricityBill].map((M) => M.deleteMany({ owner: old._id }))
    );
    await old.deleteOne();
  }

  const owner = await Owner.create({
    name: 'Demo Owner',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    phone: '9000000000',
    pgName: 'Sharma PG',
    defaultElectricityRate: RATE,
    rentDueDay: 5,
    isDemo: true,
  });

  const month = currentMonthIST();
  const today = todayIST();
  const dueDate = dueDateFor(month, owner.rentDueDay);

  for (const [i, [roomNo, name, rent, joined, prev, curr, rentPaid, elecPaid]] of DEMO.entries()) {
    const room = await Room.create({
      owner: owner._id,
      roomNumber: roomNo,
      floor: roomNo.startsWith('2') ? '2' : '1',
      monthlyRent: rent,
      capacity: 2,
      lastMeterReading: curr,
      isDemo: true,
    });

    const resident = await Resident.create({
      owner: owner._id,
      room: room._id,
      fullName: name,
      phone: `90000000${String(i + 1).padStart(2, '0')}`, // fake demo numbers
      joiningDate: new Date(joined),
      monthlyRent: rent,
      emergencyContact: { name: 'Demo Contact', phone: '9111111111' },
      isDemo: true,
    });

    await RentRecord.create({
      owner: owner._id,
      resident: resident._id,
      room: room._id,
      month,
      amountDue: rent,
      dueDate,
      payments: rentPaid ? [{ amount: rentPaid, method: rentPaid === rent ? 'UPI' : 'Cash' }] : [],
      isDemo: true,
    });

    await ElectricityBill.create({
      owner: owner._id,
      room: room._id,
      month,
      previousReading: prev,
      currentReading: curr,
      ratePerUnit: RATE,
      dueDate,
      payments: elecPaid ? [{ amount: elecPaid, method: 'Cash' }] : [],
      isDemo: true,
    });

    await Attendance.create({
      owner: owner._id,
      resident: resident._id,
      room: room._id,
      date: today,
      status: name === 'Priya Nair' ? 'On Leave' : name === 'Sahil Khan' ? 'Absent' : 'Present',
      isDemo: true,
    });
  }

  console.log('\nDemo data created (all records are flagged isDemo: true)');
  console.log(`  Login:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}\n`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Seeding failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});