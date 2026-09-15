import { verifyToken } from '../services/authService.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email, language: payload.language };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth: attaches req.user if a valid token is present, but never
// blocks the request. Used for read endpoints that are nicer with a user
// context (e.g. language preference) but shouldn't require login.
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email, language: payload.language };
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
