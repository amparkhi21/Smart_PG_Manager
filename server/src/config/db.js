import mongoose from 'mongoose';

export default async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is missing in .env');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  console.log('MongoDB connected');
}
