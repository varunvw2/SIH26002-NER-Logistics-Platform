import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, writeAudit } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { toPublicUser, createUser } from '../services/authService.js';

const router = express.Router();
// Mounted at '/api/admin' (not generic '/api') in app.js - this blanket
// admin-only check must not be reachable by requests meant for a different
// router mounted afterward. A generic mount + a role check that doesn't
// call next() on failure would silently 403 every other router's paths too.
router.use(requireAuth, requireRole('admin'));

// MODULE 11 (administration) - user & role management, audit trail ----------

router.get('/users', asyncHandler(async (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, language, district_id, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
}));

const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'authority_officer', 'logistics_manager', 'field_officer', 'driver', 'viewer']),
  language: z.enum(['en', 'hi']).default('en'),
  district_id: z.number().int().optional()
});

router.post('/users', validateBody(createUserSchema), asyncHandler(async (req, res) => {
  const user = createUser(req.body);
  writeAudit(req.user.id, 'admin_create_user', 'users', user.id, { role: req.body.role });
  res.status(201).json(user);
}));

const roleSchema = z.object({
  role: z.enum(['admin', 'authority_officer', 'logistics_manager', 'field_officer', 'driver', 'viewer'])
});

router.patch('/users/:id/role', validateBody(roleSchema), asyncHandler(async (req, res) => {
  const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  writeAudit(req.user.id, 'change_user_role', 'users', req.params.id, { role: req.body.role });
  res.json(toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)));
}));

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC LIMIT 200
  `).all();
  res.json(rows);
}));

export default router;
