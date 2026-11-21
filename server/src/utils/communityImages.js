import mongoose from 'mongoose';
import ApiError from './ApiError.js';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const imageBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'communityImages' });

export function imageType(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ApiError(400, 'Choose a JPG, PNG or WebP photo');
  if (buffer.length > IMAGE_MAX_BYTES) throw new ApiError(413, 'Photos must be 5 MB or smaller');
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      && buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.readUInt32BE(16) && buffer.readUInt32BE(20)
      && buffer.subarray(-8, -4).toString('ascii') === 'IEND') return { type: 'image/png', extension: 'png' };
  if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9) return { type: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
      && buffer.readUInt32LE(4) + 8 === buffer.length && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))) return { type: 'image/webp', extension: 'webp' };
  throw new ApiError(400, 'The file is not a supported JPG, PNG or WebP photo');
}
