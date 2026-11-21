import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { clientOrigins } from './config/env.js';
import ApiError from './utils/ApiError.js';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import residentRoutes from './routes/residentRoutes.js';
import residentPortalRoutes from './routes/residentPortalRoutes.js';
import paymentClaimRoutes from './routes/paymentClaimRoutes.js';
import roomChangeRoutes from './routes/roomChangeRoutes.js';
import messMenuRoutes from './routes/messMenuRoutes.js';
import communityRoutes from './routes/communityRoutes.js';
import complaintRoutes, { residentComplaintRoutes } from './routes/complaintRoutes.js';
import leaveRequestRoutes, { residentLeaveRequestRoutes } from './routes/leaveRequestRoutes.js';
import emergencyContactRoutes, { residentEmergencyContactRoutes } from './routes/emergencyContactRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import rentRoutes from './routes/rentRoutes.js';
import electricityRoutes from './routes/electricityRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import remindersRoutes from './routes/remindersRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export function createApp(env = process.env) {
  const app = express();
  const production = env.NODE_ENV === 'production';
  const origins = clientOrigins(env);

  // Render forwards requests through one reverse proxy. Never trust every hop.
  app.set('trust proxy', production ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Health probes and server-to-server clients do not send an Origin header.
        if (!origin || origins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, 'Origin is not allowed'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    })
  );
  app.use(express.json({ limit: '1mb' }));
  // Do not log query strings, request bodies, tokens, or database error objects.
  morgan.token('safe-path', (req) => req.originalUrl.split('?')[0]);
  app.use(morgan(production ? ':method :safe-path :status :response-time ms' : 'dev', {
    skip: (req) => ['/api/health', '/api/ready'].includes(req.path),
  }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
  });

  app.get('/api/health', (req, res) => res.json({ success: true, message: 'Smart PG Manager API is running' }));
  app.get('/api/ready', async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) throw new Error('Database disconnected');
      await mongoose.connection.db.admin().ping({ timeoutMS: 2000 });
      res.json({ success: true, message: 'API and database are ready' });
    } catch {
      res.status(503).json({ success: false, message: 'Database is unavailable' });
    }
  });
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/residents', residentRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/resident/complaints', residentComplaintRoutes);
  app.use('/api/leave-requests', leaveRequestRoutes);
  app.use('/api/resident/leave-requests', residentLeaveRequestRoutes);
  app.use('/api/emergency-contacts', emergencyContactRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/resident/emergency-contacts', residentEmergencyContactRoutes);
  app.use('/api/resident', residentPortalRoutes);
  app.use('/api/payment-claims', paymentClaimRoutes);
  app.use('/api/room-change-requests', roomChangeRoutes);
  app.use('/api/mess-menus', messMenuRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/rent', rentRoutes);
  app.use('/api/electricity', electricityRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/reminders', remindersRoutes);
  app.use('/api/reports', reportsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp();
