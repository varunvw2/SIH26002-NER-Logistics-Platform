import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, writeAudit } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAIImageProvider, getNLPProvider } from '../providers/ai/index.js';
import { createAlert } from '../services/alertEngine.js';

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Secure upload: restrict to images, cap size, randomize filename (never
// trust the client-supplied name/extension).
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPEG/PNG/WebP images are allowed'), ok);
  }
});

// MODULE 6 - Field incident reporting ---------------------------------------

router.get('/incidents', asyncHandler(async (req, res) => {
  const { type, severity, road_id, status } = req.query;
  let sql = 'SELECT i.*, r.name AS road_name, u.name AS reporter_name FROM incidents i LEFT JOIN roads r ON i.road_id = r.id LEFT JOIN users u ON i.reporter_id = u.id WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND i.type = ?'; params.push(type); }
  if (severity) { sql += ' AND i.severity = ?'; params.push(severity); }
  if (road_id) { sql += ' AND i.road_id = ?'; params.push(road_id); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  sql += ' ORDER BY i.created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
}));

const incidentSchema = z.object({
  type: z.enum(['landslide', 'flood', 'road_blocked', 'bridge_damaged', 'accident', 'heavy_traffic', 'road_damage', 'weather_hazard', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  road_id: z.coerce.number().int().optional(),
  bridge_id: z.coerce.number().int().optional(),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  description: z.string().max(2000).optional()
});

// Online incident creation, with an optional photo (MODULE 7 - AI image
// classification runs automatically if a photo is attached). Critical/high
// severity reports on a named road auto-flip that road's status so the risk
// engine and map react immediately.
router.post('/incidents', requireRole('field_officer', 'authority_officer', 'admin'), upload.single('photo'), validateBody(incidentSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  let aiClassification = null;

  if (req.file) {
    const provider = getAIImageProvider();
    aiClassification = await provider.classifyIncidentPhoto(req.file.path);
  }

  const result = db.prepare(`
    INSERT INTO incidents (type, severity, road_id, bridge_id, lat, lng, description, photo_path,
      ai_classification_json, reporter_id, source, verification_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    b.type, b.severity, b.road_id ?? null, b.bridge_id ?? null, b.latitude, b.longitude,
    b.description ?? null, req.file ? req.file.filename : null,
    aiClassification ? JSON.stringify(aiClassification) : null,
    req.user.id, req.file ? 'ai_suggested' : 'field_report',
    req.file ? 'ai_suggested' : 'pending'
  );

  const incidentId = result.lastInsertRowid;

  if (b.road_id && (b.severity === 'critical' || b.severity === 'high')) {
    db.prepare("UPDATE roads SET status = ?, last_incident_at = datetime('now') WHERE id = ?")
      .run(b.severity === 'critical' ? 'red' : 'orange', b.road_id);

    const road = db.prepare('SELECT name, state_id FROM roads WHERE id = ?').get(b.road_id);
    createAlert({
      type: b.severity === 'critical' ? 'road_blocked' : 'incident_reported',
      severity: b.severity,
      params: { road: road?.name, reason: b.type, type: b.type },
      target_role: 'authority_officer',
      road_id: b.road_id
    });
    createAlert({
      type: 'incident_reported',
      severity: b.severity,
      params: { road: road?.name, type: b.type, severity: b.severity },
      target_role: 'logistics_manager',
      road_id: b.road_id
    });
  }

  writeAudit(req.user.id, 'create_incident', 'incidents', incidentId, { type: b.type, severity: b.severity });
  res.status(201).json(db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId));
}));

router.get('/incidents/:id/photo', asyncHandler(async (req, res) => {
  const incident = db.prepare('SELECT photo_path FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident?.photo_path) return res.status(404).json({ error: 'No photo on this incident' });
  res.sendFile(path.join(UPLOAD_DIR, incident.photo_path));
}));

const verifySchema = z.object({
  verification_status: z.enum(['officially_verified', 'rejected']),
  status: z.enum(['open', 'resolved']).optional()
});

// A human authority officer/admin must confirm before an AI-suggested
// incident is treated as verified ground truth - never automatic.
router.patch('/incidents/:id/verify', requireRole('authority_officer', 'admin'), validateBody(verifySchema), asyncHandler(async (req, res) => {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  db.prepare('UPDATE incidents SET verification_status = ?, status = COALESCE(?, status) WHERE id = ?')
    .run(req.body.verification_status, req.body.status, req.params.id);

  writeAudit(req.user.id, 'verify_incident', 'incidents', incident.id, req.body);
  res.json(db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id));
}));

// --- MODULE 7 (text half) + MODULE 6/14 - free-text field reports & --------
// --- offline synchronization ------------------------------------------------

const fieldReportSchema = z.object({
  client_uuid: z.string().uuid(),
  raw_text: z.string().min(1).max(2000),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  road_id: z.coerce.number().int().optional(),
  created_offline_at: z.string().optional()
});

function ingestFieldReport(report, reporterId) {
  const existing = db.prepare('SELECT * FROM field_reports WHERE client_uuid = ?').get(report.client_uuid);
  if (existing) return { status: 'duplicate', field_report: existing }; // idempotent replay-safe sync

  const nlp = getNLPProvider().extract(report.raw_text);

  const incidentResult = db.prepare(`
    INSERT INTO incidents (type, severity, road_id, lat, lng, description, reporter_id, source, verification_status)
    VALUES (?,?,?,?,?,?,?,'ai_suggested','ai_suggested')
  `).run(nlp.type, nlp.severity, report.road_id ?? null, report.latitude, report.longitude, report.raw_text, reporterId);

  const frResult = db.prepare(`
    INSERT INTO field_reports (client_uuid, reporter_id, incident_id, raw_text, extracted_json, created_offline_at, synced_at, status)
    VALUES (?,?,?,?,?,?,datetime('now'),'synced')
  `).run(report.client_uuid, reporterId, incidentResult.lastInsertRowid, report.raw_text, JSON.stringify(nlp), report.created_offline_at ?? null);

  return {
    status: 'created',
    field_report: db.prepare('SELECT * FROM field_reports WHERE id = ?').get(frResult.lastInsertRowid),
    incident: db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentResult.lastInsertRowid),
    extracted: nlp
  };
}

// Single online submission (immediate).
router.post('/field-reports', requireRole('field_officer', 'authority_officer', 'admin'), validateBody(fieldReportSchema), asyncHandler(async (req, res) => {
  const result = ingestFieldReport(req.body, req.user.id);
  writeAudit(req.user.id, 'submit_field_report', 'field_reports', result.field_report.id);
  res.status(201).json(result);
}));

// MODULE 14 - Offline sync: the PWA queues reports in IndexedDB while
// offline (see frontend/src/offline/) and POSTs the whole queue here once
// connectivity returns. Idempotent via client_uuid so a retried sync never
// double-creates an incident.
//   LOCAL DATA -> SYNC QUEUE -> SERVER -> CENTRAL DASHBOARD
router.post('/field-reports/sync', requireRole('field_officer', 'authority_officer', 'admin'), asyncHandler(async (req, res) => {
  const reports = z.array(fieldReportSchema).parse(req.body.reports ?? []);
  const results = [];
  for (const report of reports) {
    db.prepare(`
      INSERT INTO sync_queue (client_uuid, entity_type, payload_json, status, applied_at)
      VALUES (?, 'field_report', ?, 'applied', datetime('now'))
      ON CONFLICT(client_uuid) DO NOTHING
    `).run(report.client_uuid, JSON.stringify(report));
    try {
      results.push({ client_uuid: report.client_uuid, ...ingestFieldReport(report, req.user.id) });
    } catch (error) {
      results.push({ client_uuid: report.client_uuid, status: 'failed', error: error.message });
    }
  }
  res.json({ synced: results.length, results });
}));

export default router;
