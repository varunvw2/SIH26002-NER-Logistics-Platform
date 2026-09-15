import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listAlerts, listNotificationsForUser, markNotificationRead } from '../services/alertEngine.js';

const router = express.Router();
router.use(requireAuth);

// MODULE 8 - Alert & Notification Engine ------------------------------------

router.get('/alerts', asyncHandler(async (req, res) => {
  const { severity, target_role, limit } = req.query;
  res.json(listAlerts({ severity, targetRole: target_role, limit: limit ? Number(limit) : undefined }));
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  res.json(listNotificationsForUser(req.user.id, { unreadOnly: req.query.unread === 'true' }));
}));

router.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  markNotificationRead(req.params.id, req.user.id);
  res.json({ success: true });
}));

export default router;
