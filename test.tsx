require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Configure directories
const certsDir = path.join(__dirname, 'certificates');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
  console.log('Created certificates directory');
}

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://wasimrahmanios444:bannu123@cluster0.vjdo0vv.mongodb.net/osheq?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Certificate Schema
const certificateSchema = new mongoose.Schema({
  certificateNumber: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  username: { type: String, required: true },
  courseName: { type: String, default: "OSHEQ Training" }
});
const Certificate = mongoose.model('Certificate', certificateSchema, 'certificates');

function generateCertificatePDF(pdfDoc, certificate) {
  // PDF Content - Matches exactly what's shown in frontend
  pdfDoc.fontSize(20).text('OSHEQ TRAINING', { align: 'center' }).moveDown(1);
  pdfDoc.fontSize(16).text('This certifies that', { align: 'center' }).moveDown(1);
  pdfDoc.fontSize(24).text(certificate.username, { align: 'center' }).moveDown(1);
  pdfDoc.fontSize(16).text('has successfully completed the training', { align: 'center' }).moveDown(2);
  pdfDoc.fontSize(14).text(`Certificate Number: ${certificate.certificateNumber}`, { align: 'center' }).moveDown(0.5);
  pdfDoc.text(`Issued on: ${certificate.date}`, { align: 'center' });
}

// Verify Certificate Endpoint
app.get('/api/certificates/verify', async (req, res) => {
  try {
    const { username, certificateNumber } = req.query;
    
    if (!username || !certificateNumber) {
      return res.status(400).json({ success: false, message: 'Both fields are required' });
    }

    const certificate = await Certificate.findOne({ certificateNumber });
    if (!certificate) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    if (certificate.username !== username) {
      return res.status(403).json({ success: false, message: 'Certificate mismatch' });
    }

    const pdfPath = path.join(certsDir, `${certificateNumber}.pdf`);
    const pdfUrl = `/certificates/${certificateNumber}.pdf`;
    
    // Generate PDF if doesn't exist
    if (!fs.existsSync(pdfPath)) {
      try {
        console.log(`Generating new PDF for ${certificateNumber}`);
        const pdfDoc = new PDFDocument({ size: 'A4', layout: 'portrait' });
        const stream = fs.createWriteStream(pdfPath);
        pdfDoc.pipe(stream);
        generateCertificatePDF(pdfDoc, certificate);
        pdfDoc.end();
        
        await new Promise((resolve, reject) => {
          stream.on('finish', resolve);
          stream.on('error', reject);
        });
        
        console.log(`PDF successfully generated at ${pdfPath}`);
      } catch (err) {
        console.error('PDF generation failed:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Certificate valid but PDF generation failed' 
        });
      }
    }

    res.json({
      success: true,
      certificate: {
        holderName: certificate.username,
        certificateNumber: certificate.certificateNumber,
        courseName: certificate.courseName,
        date: certificate.date,
        pdfUrl: pdfUrl
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Serve PDF files with proper headers
app.use('/certificates', express.static(certsDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="certificate.pdf"');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Certificate directory: ${certsDir}`);
  console.log(`PDF endpoint: http://localhost:${PORT}/certificates/`);
});