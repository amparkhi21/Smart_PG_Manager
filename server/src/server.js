import 'dotenv/config';
import connectDB from './config/db.js';
import mongoose from 'mongoose';
import { validateEnv } from './config/env.js';

let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: closing API connections`);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  clearTimeout(deadline);
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });

let configuration;
try {
  configuration = validateEnv();
} catch (error) {
  // Validation messages contain variable names only, never their values.
  console.error(error.message);
  process.exit(1);
}

try {
  const { default: app } = await import('./app.js');
  await connectDB();
  server = app.listen(configuration.port, '0.0.0.0', () => console.log(`Smart PG Manager API running on port ${configuration.port}`));
  server.on('error', () => {
    console.error('HTTP server failed to listen. Check PORT and service configuration.');
    process.exit(1);
  });
} catch {
  // Driver errors can contain connection credentials; never print them.
  console.error('Startup failed. Check MONGO_URI, database credentials, DNS, and Atlas network access.');
  process.exit(1);
}
