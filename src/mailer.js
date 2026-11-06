/**
 * mailer.js — sends ATP credentials. With SMTP_* env vars it uses nodemailer;
 * without them it writes data/mail-outbox.json (dev) so the flow stays testable.
 */
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const OUTBOX = path.join(DATA_DIR, 'mail-outbox.json');

const configured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function outboxWrite(entry) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(OUTBOX, 'utf8')); } catch { rows = []; }
  rows.push(entry);
  fs.writeFileSync(OUTBOX, JSON.stringify(rows, null, 2));
}

function credentialsEmail({ name, academy, email, password, loginUrl }) {
  const subject = 'Your OSHEQ ATP Portal access is approved';
  const text = `Hello ${name},

Your Authorized Training Partner application for "${academy}" has been approved.

ATP Portal: ${loginUrl}
Email: ${email}
Password: ${password}

Please sign in and change your password after the first login.

— OSHEQ Certification`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px">
  <h2 style="color:#0b6b45;margin:0 0 8px">ATP application approved</h2>
  <p>Hello <b>${name}</b>,</p>
  <p>Your Authorized Training Partner application for <b>${academy}</b> has been approved.
     You can now sign in to the ATP Portal.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f4f8f5">Portal</td><td style="padding:6px 12px"><a href="${loginUrl}">${loginUrl}</a></td></tr>
    <tr><td style="padding:6px 12px;background:#f4f8f5">Email</td><td style="padding:6px 12px">${email}</td></tr>
    <tr><td style="padding:6px 12px;background:#f4f8f5">Password</td><td style="padding:6px 12px"><code>${password}</code></td></tr>
  </table>
  <p style="color:#667">Please change your password after the first login.</p>
  <p style="color:#667">— OSHEQ Certification</p>
</div>`;
  return { subject, text, html };
}

async function send({ to, subject, text, html }) {
  const entry = { to, subject, text, html, at: new Date().toISOString() };
  if (!configured()) {
    entry.delivered = false;
    entry.reason = 'SMTP not configured — written to data/mail-outbox.json';
    outboxWrite(entry);
    console.log('[mail] SMTP not configured, outbox entry saved for', to);
    return { delivered: false, outbox: true };
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || 'OSHEQ Certification <no-reply@osheq.us>',
    to, subject, text, html,
  });
  entry.delivered = true;
  entry.messageId = info.messageId;
  outboxWrite(entry);
  return { delivered: true, messageId: info.messageId };
}

module.exports = { send, credentialsEmail, configured };
