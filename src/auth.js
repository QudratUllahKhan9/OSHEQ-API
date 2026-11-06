const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'osheq-dev-secret-change-me';

const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: '7d' });
const verify = (token) => { try { return jwt.verify(token, SECRET); } catch { return null; } };

function adminOnly(req, res, next) {
  const key = req.get('x-admin-key') || req.query.key || '';
  const expected = process.env.ADMIN_KEY || 'osheq-admin-2026';
  if (!key || key !== expected) return res.status(401).json({ ok: false, error: 'Admin key galat hai.' });
  next();
}

function atpOnly(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verify(token);
  if (!payload || payload.role !== 'atp') return res.status(401).json({ ok: false, error: 'Login required.' });
  req.atp = payload;
  next();
}

module.exports = { sign, verify, adminOnly, atpOnly };
