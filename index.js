/**
 * OSHEQ API — certificates + ATP (Authorized Training Partner) onboarding.
 * Pure-JS PDF rendering (no browser). Boots with MongoDB or JSON fallback.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const store = require('./src/store');
const mailer = require('./src/mailer');
const { sign } = require('./src/auth');
const { adminOnly, atpOnly } = require('./src/auth');
const cert = require('./src/certService');
const cloud = require('./src/cloudinary');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '7d' }));

const backendBase = (req) => (process.env.BACKEND_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
const frontendBase = () => (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')[0].trim();

/* ---------------------------------------------------------------- health */
app.get('/api/health', (req, res) => res.json({
  ok: true, uptime: process.uptime(), store: store.mode,
  mailer: mailer.configured() ? 'smtp' : 'outbox', renderer: 'pure-js',
}));

/* ------------------------------------------------------------- ATP apply */
app.post('/api/atp/apply', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const academy = String(req.body.academy || req.body.organization || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!name || !academy || !email) return res.status(400).json({ ok: false, error: 'Name, academy aur email zaroori hain.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Email sahi nahi hai.' });

    const dup = await store.findOne('atp', { email });
    if (dup && dup.status === 'approved') return res.status(409).json({ ok: false, error: 'Ye email pehle se approved hai — login karein.' });
    if (dup && dup.status === 'pending') return res.status(409).json({ ok: false, error: 'Ye application pehle se pending hai.' });

    const row = await store.insert('atp', {
      name, academy, email,
      contact: String(req.body.contact || '').trim(),
      note: String(req.body.note || '').trim(),
      status: 'pending',
    });
    res.json({ ok: true, application: { id: row.id, name, academy, email, status: 'pending' } });
  } catch (e) {
    console.error('[atp/apply]', e.message);
    res.status(500).json({ ok: false, error: 'Application save nahi hui.' });
  }
});

/* ------------------------------------------------------------- ATP admin */
app.get('/api/atp', adminOnly, async (req, res) => {
  const rows = await store.find('atp', req.query.status ? { status: req.query.status } : {});
  res.json({ ok: true, applications: rows });
});

app.post('/api/atp/:id/approve', adminOnly, async (req, res) => {
  try {
    const app1 = await store.findOne('atp', { id: req.params.id });
    if (!app1) return res.status(404).json({ ok: false, error: 'Application nahi mili.' });
    if (app1.status === 'approved') return res.status(409).json({ ok: false, error: 'Pehle se approved hai.' });

    const password = (req.body && req.body.password) || ('Osh' + crypto.randomBytes(4).toString('hex') + '!');
    const hash = await bcrypt.hash(password, 10);
    const loginUrl = `${frontendBase()}/atp/login`;

    await store.update('atp', { id: app1.id }, { status: 'approved', approvedAt: new Date().toISOString() });
    await store.insert('atp_users', {
      email: app1.email, name: app1.name, academy: app1.academy,
      passwordHash: hash, atpId: app1.id, role: 'atp',
      mustChangePassword: true,
    });

    const msg = mailer.credentialsEmail({ name: app1.name, academy: app1.academy, email: app1.email, password, loginUrl });
    let mail = { delivered: false };
    try { mail = await mailer.send({ to: app1.email, ...msg }); }
    catch (e) { mail = { delivered: false, error: e.message }; }

    console.log('[atp] approved', app1.email, '| mail:', mail.delivered ? 'sent' : 'outbox');
    res.json({
      ok: true,
      credentials: { email: app1.email, name: app1.name, academy: app1.academy, password, loginUrl },
      mail,
    });
  } catch (e) {
    console.error('[atp/approve]', e.message);
    res.status(500).json({ ok: false, error: 'Approve fail hua: ' + e.message });
  }
});

app.post('/api/atp/:id/reject', adminOnly, async (req, res) => {
  const row = await store.update('atp', { id: req.params.id }, { status: 'rejected', rejectedAt: new Date().toISOString() });
  if (!row) return res.status(404).json({ ok: false, error: 'Application nahi mili.' });
  res.json({ ok: true, application: row });
});

/* --------------------------------------------------------------- ATP auth */
app.post('/api/atp/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await store.findOne('atp_users', { email });
    if (!user) return res.status(401).json({ ok: false, error: 'Email ya password galat hai.' });
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ ok: false, error: 'Email ya password galat hai.' });
    const token = sign({ role: 'atp', sub: user.id, email: user.email, name: user.name, academy: user.academy });
    res.json({ ok: true, token, user: { name: user.name, academy: user.academy, email: user.email } });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Login fail hua.' });
  }
});

app.get('/api/atp/me', atpOnly, async (req, res) => {
  const user = await store.findOne('atp_users', { id: req.atp.sub });
  if (!user) return res.status(404).json({ ok: false, error: 'Account nahi mila.' });
  const mine = await store.find('certificates', { atpEmail: user.email });
  res.json({ ok: true, user: { name: user.name, academy: user.academy, email: user.email }, certificates: mine });
});

app.post('/api/atp/change-password', atpOnly, async (req, res) => {
  const user = await store.findOne('atp_users', { id: req.atp.sub });
  if (!user) return res.status(404).json({ ok: false, error: 'Account nahi mila.' });
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (next.length < 8) return res.status(400).json({ ok: false, error: 'Naya password kam az kam 8 characters.' });
  if (!(await bcrypt.compare(current, user.passwordHash || ''))) return res.status(401).json({ ok: false, error: 'Purana password galat hai.' });
  await store.update('atp_users', { id: user.id }, { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false });
  res.json({ ok: true });
});

/* ---------------------------------------------------------- certificates */
app.post('/api/certificates', adminOnly, async (req, res) => {
  try {
    const { name, course, provider, date, certNo } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: 'Participant ka naam zaroori hai.' });
    const number = String(certNo || '').trim() || String(Math.floor(10000000 + Math.random() * 89999999));
    if (await store.findOne('certificates', { certNo: number })) {
      return res.status(409).json({ ok: false, error: `Certificate number "${number}" pehle se maujood hai.` });
    }
    const verifyUrl = `${backendBase(req)}/v/${encodeURIComponent(number)}`;
    const qrDataUrl = await cert.qrFor(verifyUrl);
    const dateText = cert.formatDate(date);
    const made = await cert.build({
      name: String(name).trim(), course: String(course || '').trim(),
      provider: String(provider || 'Safety Solution Pvt Ltd.').trim(),
      dateText, certNo: number, qrDataUrl,
    });

    let storage = 'local', previewUrl = null, pdfUrl = null, uploadError = null;
    if (cloud.isConfigured()) {
      try {
        const meta = { certNo: number, name, course: course || '', provider: provider || '', dateText, verifyUrl };
        const p = await cloud.uploadPdf(made.pdfPath, number, meta);
        const i = await cloud.uploadPreview(made.pngPath, number, meta);
        pdfUrl = p.secure_url; previewUrl = cloud.previewDisplayUrl(i.public_id); storage = 'cloudinary';
      } catch (e) { uploadError = e.message; }
    }

    const row = await store.insert('certificates', {
      certNo: number, name, course: course || '', provider: provider || 'Safety Solution Pvt Ltd.',
      dateText, verifyUrl, storage, pdfUrl, previewUrl, uploadError,
      atpEmail: req.body.atpEmail || '', pdfBytes: made.pdfBytes,
    });
    res.json({ ok: true, certificate: row, engine: made.engine });
  } catch (e) {
    console.error('[cert create]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/certificates', adminOnly, async (req, res) => {
  res.json({ ok: true, certificates: await store.find('certificates') });
});

app.get('/api/certificates/:certNo', async (req, res) => {
  const row = await store.findOne('certificates', { certNo: req.params.certNo });
  if (!row) return res.status(404).json({ ok: false, error: 'Certificate not found' });
  res.json({ ok: true, certificate: row });
});

/* legacy verify (username + certificateNumber) */
app.get('/api/certificates/verify', async (req, res) => {
  const { username, certificateNumber } = req.query;
  if (!username || !certificateNumber) return res.status(400).json({ success: false, message: 'Both username and certificate number are required' });
  const row = await store.findOne('certificates', { certNo: certificateNumber });
  if (!row) return res.status(404).json({ success: false, message: 'Certificate not found' });
  if (String(row.name).toLowerCase() !== String(username).toLowerCase()) {
    return res.status(403).json({ success: false, message: 'Username does not match certificate records' });
  }
  res.json({ success: true, certificate: { holderName: row.name, certificateNumber: row.certNo, courseName: row.course, dateOfIssue: row.dateText, pdfUrl: `/api/pdf/${row.certNo}` } });
});

/* verify page — QR lands here */
app.get('/v/:certNo', async (req, res) => {
  const row = await store.findOne('certificates', { certNo: req.params.certNo });
  if (!row) return res.status(404).send(cert.notFoundHtml(req.params.certNo));
  res.send(cert.verifyHtml(row, { backendBase: backendBase(req) }));
});

/* raw files */
app.get('/api/pdf/:certNo', async (req, res) => {
  const row = await store.findOne('certificates', { certNo: req.params.certNo });
  if (!row) return res.status(404).json({ ok: false, error: 'Certificate not found' });
  if (row.storage === 'cloudinary' && row.certNo) {
    try { return res.redirect(302, cloud.signedPdfUrl(row.certNo)); } catch (_) {}
  }
  const p = path.join(cert.PDF_DIR, `${row.certNo}.pdf`);
  if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'PDF missing' });
  res.type('application/pdf').sendFile(p);
});

app.get('/api/preview/:certNo', async (req, res) => {
  const row = await store.findOne('certificates', { certNo: req.params.certNo });
  if (!row) return res.status(404).json({ ok: false, error: 'not found' });
  if (row.previewUrl) return res.redirect(302, row.previewUrl);
  const p = path.join(cert.PNG_DIR, `${row.certNo}.png`);
  if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'preview missing' });
  res.type('image/png').sendFile(p);
});

app.get('/api/qr/:certNo', async (req, res) => {
  const row = await store.findOne('certificates', { certNo: req.params.certNo });
  const target = row ? row.verifyUrl : `${backendBase(req)}/v/${req.params.certNo}`;
  const buf = await require('qrcode').toBuffer(target, { errorCorrectionLevel: 'M', margin: 0, width: 512 });
  res.type('image/png').send(buf);
});

/* admin session check */
app.post('/api/admin/login', (req, res) => {
  const key = String((req.body && req.body.key) || '');
  if (key !== (process.env.ADMIN_KEY || 'osheq-admin-2026')) return res.status(401).json({ ok: false, error: 'Admin key galat hai.' });
  res.json({ ok: true, token: sign({ role: 'admin' }) });
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

const PORT = process.env.PORT || 5000;
store.init().catch(() => {}).finally(() => {
  app.listen(PORT, () => {
    console.log(`\nOSHEQ API on http://localhost:${PORT}`);
    console.log(`store=${store.mode} mailer=${mailer.configured() ? 'smtp' : 'outbox'} renderer=pure-js`);
    if (!cloud.isConfigured()) console.log('Cloudinary not configured — PDFs stay local in work/');
  });
});

module.exports = app;
