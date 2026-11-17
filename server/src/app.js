import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import residentRoutes from './routes/residentRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import rentRoutes from './routes/rentRoutes.js';
import electricityRoutes from './routes/electricityRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import remindersRoutes from './routes/remindersRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Smart PG Manager API is running' }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/rent', rentRoutes);
app.use('/api/electricity', electricityRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/reports', reportsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;