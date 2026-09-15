import { db } from '../db/index.js';

// MODULE - Role-based authorization.
//
// requireRole('admin', 'logistics_manager') -> 403s anyone else.
// Always call requireAuth first so req.user is populated.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${allowedRoles.join(', ')}` });
    }
    next();
  };
}

export function auditLog(action, entityType) {
  return (req, _res, next) => {
    req._audit = { action, entityType };
    next();
  };
}

export function writeAudit(userId, action, entityType, entityId, details = {}) {
  db.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json) VALUES (?,?,?,?,?)')
    .run(userId ?? null, action, entityType ?? null, entityId ?? null, JSON.stringify(details));
}
