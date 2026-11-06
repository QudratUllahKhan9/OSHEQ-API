/** certService.js — makes the certificate PDF + preview PNG and the verify page. */
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { renderCertificate } = require('./render-pdf');

const WORK = process.env.WORK_DIR || path.join(__dirname, '..', 'work');
const PDF_DIR = path.join(WORK, 'pdf');
const PNG_DIR = path.join(WORK, 'png');
for (const d of [PDF_DIR, PNG_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(iso) {
  if (!iso) return '00-Apr-0000';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}`;
  const dmy = String(iso).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${String(dmy[1]).padStart(2,'0')}-${MONTHS[Number(dmy[2]) - 1]}-${dmy[3]}`;
  return '00-Apr-0000';
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function build({ name, course, provider, dateText, certNo, qrDataUrl }) {
  const pdfPath = path.join(PDF_DIR, `${certNo}.pdf`);
  const pngPath = path.join(PNG_DIR, `${certNo}.png`);
  const r = await renderCertificate({ name, course, provider, dateText, certNo, qrDataUrl }, { pdfPath, pngPath });
  return { pdfPath, pngPath, ...r };
}

async function qrFor(url) {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, width: 512, color: { dark: '#000000', light: '#ffffff' } });
}

/* Verify page — same artwork, same positions as the PDF, so it looks identical. */
function verifyHtml(c, { backendBase }) {
  const bg = `/assets/bg_clean2.jpg`;
  const qr = `${backendBase}/api/qr/${encodeURIComponent(c.certNo)}`;
  const pdf = `${backendBase}/api/pdf/${encodeURIComponent(c.certNo)}`;
  const png = `${backendBase}/api/preview/${encodeURIComponent(c.certNo)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificate ${esc(c.certNo)} — OSHEQ</title>
<style>
  :root { --green:#0b6b45; --ink:#1a1a1a; }
  *{box-sizing:border-box} body{margin:0;font-family:'Montserrat',Segoe UI,Arial,sans-serif;background:#eef2ef;color:var(--ink)}
  .wrap{max-width:980px;margin:0 auto;padding:20px}
  .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
  .badge{display:inline-flex;gap:8px;align-items:center;background:#e6f6ec;color:#0b6b45;border:1px solid #b7e2c6;
         padding:8px 14px;border-radius:999px;font-weight:700;font-size:14px}
  .actions{display:flex;gap:8px;flex-wrap:wrap}
  .btn{padding:10px 16px;border-radius:10px;border:1px solid #cfd8d2;background:#fff;color:#134;text-decoration:none;
       font-weight:600;font-size:14px}
  .btn.primary{background:var(--green);color:#fff;border-color:var(--green)}
  /* A4 sheet: 794x1123 at 96dpi, scaled with a transform-free fluid width */
  .sheet{position:relative;width:100%;max-width:794px;margin:0 auto;aspect-ratio:794/1123;
         background:#fff url('${bg}') center/100% 100% no-repeat;border-radius:10px;
         box-shadow:0 10px 30px rgba(12,50,35,.14);overflow:hidden;container-type:inline-size}
  .f{position:absolute;left:0;right:0;text-align:center;transform:translateY(-100%);line-height:1.1}
  .f.name{top:36.6%;font-family:'EB Garamond',Georgia,serif;font-weight:700;color:#15986A;font-size:3.61cqw}
  .f.course{top:55.6%;font-weight:700;font-size:1.64cqw}
  .f.provider{top:60.8%;font-weight:600;font-size:2.04cqw}
  .f.dated{top:66.9%;font-weight:500;font-size:1.44cqw}
  .f.certno{top:71.2%;font-weight:500;font-size:1.44cqw}
  .qr{position:absolute;left:6.17%;top:82.7%;width:13.2%;background:#fff}
  .qr img{width:100%;display:block}
  .meta{background:#fff;border-radius:12px;padding:16px;margin-top:16px;font-size:14px;line-height:1.7}
  .meta b{color:#0b6b45}
  @media (max-width:520px){ .wrap{padding:12px} .badge{font-size:12px;padding:6px 10px} .btn{padding:9px 12px;font-size:13px} }
</style></head><body>
<div class="wrap">
  <div class="bar">
    <span class="badge">✓ Verified certificate</span>
    <div class="actions">
      <a class="btn primary" href="${pdf}" target="_blank" rel="noopener">Download PDF</a>
      <a class="btn" href="${png}" target="_blank" rel="noopener">Open image</a>
    </div>
  </div>
  <div class="sheet">
    <div class="f name">${esc(c.name)}</div>
    ${c.course ? `<div class="f course">${esc(c.course)}</div>` : ''}
    <div class="f provider">${esc(c.provider || 'Safety Solution Pvt Ltd.')}</div>
    <div class="f dated">DATED: ${esc(c.dateText)}</div>
    <div class="f certno">CERTIFICATE NO: ${esc(c.certNo)}</div>
    <div class="qr"><img src="${qr}" alt="verify QR"></div>
  </div>
  <div class="meta">
    <div><b>Name:</b> ${esc(c.name)}</div>
    <div><b>Certificate No:</b> ${esc(c.certNo)}</div>
    <div><b>Course:</b> ${esc(c.course || '—')}</div>
    <div><b>Issued:</b> ${esc(c.dateText)}</div>
    <div><b>Issued by:</b> ${esc(c.provider || 'Safety Solution Pvt Ltd.')}</div>
  </div>
</div></body></html>`;
}

function notFoundHtml(id) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificate not found</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#eef2ef;display:grid;place-items:center;height:100vh;margin:0}
.c{background:#fff;padding:32px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;max-width:420px}
h1{color:#b4232a;margin:0 0 8px;font-size:20px}p{color:#556;margin:0}</style></head><body>
<div class="c"><h1>Certificate not found</h1><p>Is number ka koi certificate record nahi mila: <b>${esc(id)}</b></p></div></body></html>`;
}

module.exports = { build, qrFor, formatDate, verifyHtml, notFoundHtml, PDF_DIR, PNG_DIR, WORK };
