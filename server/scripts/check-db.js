// Read-only connectivity check: no application models, seeding, or index creation.
import 'dotenv/config';
import mongoose from 'mongoose';

let client;
try {
  if (!process.env.MONGO_URI || /<[^>]+>/.test(process.env.MONGO_URI)) throw new Error();
  client = new mongoose.mongo.MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  await client.connect();
  await client.db().admin().ping({ timeoutMS: 2000 });
  console.log('MongoDB ping passed (read-only; no records or indexes changed).');
} catch {
  console.error('MongoDB ping failed. Check MONGO_URI, database credentials, DNS, and Atlas network access. No connection details logged.');
  process.exitCode = 1;
} finally {
  if (client) await client.close();
}
