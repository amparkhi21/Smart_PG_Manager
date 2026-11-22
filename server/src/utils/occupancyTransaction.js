import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
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

async function withStandaloneOccupancyLock(ownerId, action) {
  const token = randomUUID();
  const giveUpAt = Date.now() + 10000;
  let acquired = false;
  while (!acquired && Date.now() < giveUpAt) {
    const now = new Date();
    const lock = await Owner.findOneAndUpdate({
      _id: ownerId,
      $or: [
        { occupancyLockExpiresAt: { $lt: now } },
        { occupancyLockExpiresAt: { $exists: false } },
      ],
    }, { $set: { occupancyLockToken: token, occupancyLockExpiresAt: new Date(now.getTime() + 60000) } }, { new: true }).select('_id');
    acquired = Boolean(lock);
    if (!acquired) {
      if (!(await Owner.exists({ _id: ownerId }))) throw new ApiError(401, 'Account no longer exists');
      await delay(50);
    }
  }
  if (!acquired) throw new ApiError(503, 'Another room or bed update is in progress. Try again shortly.');

  const heartbeat = setInterval(() => {
    const now = new Date();
    Owner.updateOne({ _id: ownerId, occupancyLockToken: token }, {
      $set: { occupancyLockExpiresAt: new Date(now.getTime() + 60000) },
    }).catch(() => {});
  }, 20000);
  heartbeat.unref?.();
  try {
    return await action(null);
  } finally {
    clearInterval(heartbeat);
    await Owner.updateOne({ _id: ownerId, occupancyLockToken: token }, {
      $unset: { occupancyLockToken: 1, occupancyLockExpiresAt: 1 },
    });
  }
}

// All operations that can consume a bed or reduce capacity share this lock.
// The owner document exists already, avoiding races when creating a lock row.
export async function withOccupancyTransaction(ownerId, action, { required = false } = {}) {
  if (!(await supportsTransactions())) {
    if (required) throw new ApiError(503, 'This room operation requires a MongoDB replica set or Atlas connection');
    // Standalone MongoDB cannot run multi-document transactions; this owner-scoped
    // lease serializes every occupancy operation across API workers instead.
    return withStandaloneOccupancyLock(ownerId, action);
  }
  return mongoose.connection.transaction(async (session) => {
    const lock = await Owner.updateOne({ _id: ownerId }, { $inc: { occupancyRevision: 1 } }, { session });
    if (!lock.matchedCount) throw new ApiError(401, 'Account no longer exists');
    return action(session);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000 });
}
