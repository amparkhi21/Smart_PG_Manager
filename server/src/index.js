import './config/loadEnv.js';
import connectDB from './config/db.js';
import mongoose from 'mongoose';
import { validateEnv } from './config/env.js';
import { startupErrorDetails } from './utils/startupError.js';

let server;
let stopPushWorker;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: closing API connections`);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopPushWorker?.();
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

let startupStage = 'application initialization';
try {
  const { default: app } = await import('./app.js');
  startupStage = 'MongoDB connection';
  await connectDB();
  startupStage = 'push worker initialization';
  const { startPushWorker } = await import('./services/workers/pushNotificationWorker.js');
  stopPushWorker = startPushWorker();
  startupStage = 'HTTP listening';
  server = app.listen(configuration.port, '0.0.0.0', () => console.log(`Smart PG Manager API running on port ${configuration.port}`));
  server.on('error', (error) => {
    console.error(`HTTP server failed to listen. ${startupErrorDetails(error)}`);
    process.exit(1);
  });
} catch (error) {
  console.error(`Startup failed during ${startupStage}. ${startupErrorDetails(error)}`);
  process.exit(1);
}
