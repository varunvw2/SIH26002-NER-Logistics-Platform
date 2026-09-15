import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set a real secret.');
}

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email, language: user.language },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function createUser({ name, email, password, role = 'viewer', language = 'en', district_id = null }) {
  const password_hash = hashPassword(password);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, language, district_id) VALUES (?,?,?,?,?,?)'
  ).run(name, email, password_hash, role, language, district_id);
  return db.prepare('SELECT id, name, email, role, language, district_id, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);
}

export function toPublicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}
