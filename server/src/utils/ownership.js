import mongoose from 'mongoose';
import ApiError from './ApiError.js';

// Fetch a document only if it belongs to the logged-in owner.
// Returns 404 (not 403) so other owners' data is never revealed.
export async function findOwned(Model, id, req, populate, session, select) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid id');
  let query = Model.findOne({ _id: id, owner: req.owner._id });
  if (session) query = query.session(session);
  if (populate) query = query.populate(populate);
  if (select) query = query.select(select);
  const doc = await query;
  if (!doc) throw new ApiError(404, `${Model.modelName} not found`);
  return doc;
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
