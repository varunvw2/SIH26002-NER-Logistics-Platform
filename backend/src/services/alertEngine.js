// MODULE 8 - Alert & Notification Engine
//
// Alerts are bilingual (English always generated; Hindi generated from the
// same template set - additional languages can be added by dropping a new
// {lang}.json file in src/i18n/ and adding it to LANGS below, no code
// changes elsewhere required per the spec's "additional languages can be
// added later" requirement). Targeting follows the spec's examples: a
// vehicle-specific alert reaches only that vehicle's driver; a district
// incident reaches that district's authority officers (+ admins); a
// corridor-wide disruption reaches logistics managers (+ admins).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'hi'];
const templates = Object.fromEntries(
  LANGS.map(lang => [lang, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', `${lang}.json`), 'utf-8'))])
);

function render(type, lang, params) {
  let text = templates[lang]?.[type] || templates.en[type] || type;
  for (const [key, value] of Object.entries(params)) {
    text = text.replaceAll(`{${key}}`, String(value ?? '-'));
  }
  return text;
}

function recipientsFor({ target_role, target_district_id, vehicle_id }) {
  if (vehicle_id && target_role === 'driver') {
    const row = db.prepare(`
      SELECT u.id FROM vehicles v
      JOIN drivers d ON v.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE v.id = ?
    `).get(vehicle_id);
    if (row) return [row.id];
    return []; // no linked driver account yet - still create the alert, just no notification row
  }

  if (target_district_id) {
    return db.prepare(
      "SELECT id FROM users WHERE (role = ? AND district_id = ?) OR role = 'admin'"
    ).all(target_role, target_district_id).map(r => r.id);
  }

  return db.prepare("SELECT id FROM users WHERE role = ? OR role = 'admin'").all(target_role).map(r => r.id);
}

/**
 * @param {object} opts
 * @param {string} opts.type - template key (see src/i18n/en.json)
 * @param {'low'|'medium'|'high'|'critical'} opts.severity
 * @param {object} opts.params - placeholders for the message template
 * @param {string} opts.target_role
 * @param {number} [opts.target_district_id]
 * @param {number} [opts.road_id]
 * @param {number} [opts.vehicle_id]
 * @param {boolean} [opts.is_prediction]
 */
export function createAlert(opts) {
  const { type, severity, params = {}, target_role, target_district_id, road_id, vehicle_id, is_prediction = false } = opts;

  const message_en = render(type, 'en', params);
  const message_hi = render(type, 'hi', params);

  const result = db.prepare(`
    INSERT INTO alerts (type, severity, message_en, message_hi, target_role, target_district_id, road_id, vehicle_id, is_prediction)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(type, severity, message_en, message_hi, target_role ?? null, target_district_id ?? null, road_id ?? null, vehicle_id ?? null, is_prediction ? 1 : 0);

  const alertId = result.lastInsertRowid;
  const recipients = recipientsFor({ target_role, target_district_id, vehicle_id });
  const insNotif = db.prepare('INSERT INTO notifications (alert_id, user_id) VALUES (?, ?)');
  for (const userId of recipients) insNotif.run(alertId, userId);

  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
}

export function listAlerts({ limit = 50, severity, targetRole } = {}) {
  let sql = 'SELECT * FROM alerts WHERE 1=1';
  const params = [];
  if (severity) { sql += ' AND severity = ?'; params.push(severity); }
  if (targetRole) { sql += ' AND target_role = ?'; params.push(targetRole); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function listNotificationsForUser(userId, { unreadOnly = false } = {}) {
  let sql = `
    SELECT n.id AS notification_id, n.read_at, a.*
    FROM notifications n JOIN alerts a ON n.alert_id = a.id
    WHERE n.user_id = ?
  `;
  if (unreadOnly) sql += ' AND n.read_at IS NULL';
  sql += ' ORDER BY a.created_at DESC LIMIT 100';
  return db.prepare(sql).all(userId);
}

export function markNotificationRead(notificationId, userId) {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(notificationId, userId);
}
