import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import fleetRoutes from './routes/fleet.routes.js';
import shipmentsRoutes from './routes/shipments.routes.js';
import incidentsRoutes from './routes/incidents.routes.js';
import weatherRoutes from './routes/weather.routes.js';
import planningRoutes from './routes/planning.routes.js';
import alertsRoutes from './routes/alerts.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import emergencyRoutes from './routes/emergency.routes.js';
import adminRoutes from './routes/admin.routes.js';
import driverRoutes from './routes/driver.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

dotenv.config();

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') }));
  app.use(express.json({ limit: '2mb' }));

  // General API rate limit (auth endpoints have their own stricter limiter).
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sih26002-backend' }));

  app.use('/api/auth', authRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', fleetRoutes);
  app.use('/api', shipmentsRoutes);
  app.use('/api', incidentsRoutes);
  app.use('/api', weatherRoutes);
  app.use('/api', planningRoutes);
  app.use('/api', alertsRoutes);
  app.use('/api', analyticsRoutes);
  app.use('/api', emergencyRoutes);
  // Mounted at their own specific prefixes (not generic '/api') so their
  // blanket role-restricted router.use() can never intercept a request bound
  // for a different router mounted afterward - see the comment on each
  // file's router.use() line for why that matters.
  app.use('/api/admin', adminRoutes);
  app.use('/api/driver', driverRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
