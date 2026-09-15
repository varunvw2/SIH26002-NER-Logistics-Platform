import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { createUser, findUserByEmail, verifyPassword, issueToken, toPublicUser } from '../services/authService.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { writeAudit } from '../middleware/roles.js';

const router = express.Router();

// Slow down brute-force attempts on auth endpoints specifically.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  // Self-registration is deliberately limited to non-privileged roles;
  // admin/authority/logistics_manager accounts are provisioned via
  // /api/admin/users by an existing admin.
  role: z.enum(['field_officer', 'driver', 'viewer']).default('viewer'),
  language: z.enum(['en', 'hi']).default('en')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/register', authLimiter, validateBody(registerSchema), asyncHandler(async (req, res) => {
  if (findUserByEmail(req.body.email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const user = createUser(req.body);
  writeAudit(user.id, 'register', 'users', user.id);
  const token = issueToken(user);
  res.status(201).json({ token, user });
}));

router.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const user = findUserByEmail(req.body.email);
  if (!user || !verifyPassword(req.body.password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = issueToken(user);
  writeAudit(user.id, 'login', 'users', user.id);
  res.json({ token, user: toPublicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
