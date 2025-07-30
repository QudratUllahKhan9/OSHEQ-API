require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const stream = require('stream');
const path = require('path');
const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'YOUR_VERCEL_APP_URL'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

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
  // PDF Content
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

    // Generate PDF on the fly (no file storage)
    const pdfDoc = new PDFDocument({ size: 'A4', layout: 'portrait' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${certificateNumber}.pdf"`);
    
    // Stream the PDF directly to the response
    pdfDoc.pipe(res);
    generateCertificatePDF(pdfDoc, certificate);
    pdfDoc.end();

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;