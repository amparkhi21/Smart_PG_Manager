import mongoose from 'mongoose';
import Owner from '../models/Owner.js';
import ApiError from './ApiError.js';

const capabilities = new WeakMap();
async function supportsTransactions() {
  const db = mongoose.connection.db;
  if (!db) throw new ApiError(503, 'Database is unavailable');
  if (!capabilities.has(db)) {
    capabilities.set(db, db.admin().command({ hello: 1 }).then((hello) => Boolean(hello.setName || hello.msg === 'isdbgrid')).catch((error) => {
      capabilities.delete(db); throw error;
    }));
  }
  return capabilities.get(db);
}

// All operations that can consume a bed or reduce capacity share this lock.
// The owner document exists already, avoiding races when creating a lock row.
export async function withOccupancyTransaction(ownerId, action, { required = false } = {}) {
  if (!(await supportsTransactions())) {
    if (required) throw new ApiError(503, 'Room change requests require a MongoDB replica set or Atlas connection');
    // Keep legacy standalone development databases usable. Approvals are disabled there.
    return action(null);
  }
  return mongoose.connection.transaction(async (session) => {
    const lock = await Owner.updateOne({ _id: ownerId }, { $inc: { occupancyRevision: 1 } }, { session });
    if (!lock.matchedCount) throw new ApiError(401, 'Account no longer exists');
    return action(session);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000 });
}
