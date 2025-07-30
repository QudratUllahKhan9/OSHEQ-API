require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Middleware
app.use(cors({
  origin: ['https://osheq.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Configure directories
const certsDir = path.join(__dirname, 'certificates'); // Note: Fixed typo from "certificates"
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

// Verify Certificate Endpoint
app.get('/api/certificates/verify', async (req, res) => {
  try {
    const { username, certificateNumber } = req.query;
    
    if (!username || !certificateNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both username and certificate number are required' 
      });
    }

    const certificate = await Certificate.findOne({ certificateNumber });
    
    if (!certificate) {
      return res.status(404).json({ 
        success: false, 
        message: 'Certificate not found' 
      });
    }
    
    if (certificate.username !== username) {
      return res.status(403).json({ 
        success: false, 
        message: 'Username does not match certificate records' 
      });
    }

    // Check if PDF exists
    const pdfPath = path.join(certsDir, `${certificateNumber}.pdf`);
    const pdfExists = fs.existsSync(pdfPath);

    res.json({
      success: true,
      certificate: {
        holderName: certificate.username,
        certificateNumber: certificate.certificateNumber,
        courseName: certificate.courseName,
        date: certificate.date,
        pdfUrl: `/certificates/${certificateNumber}.pdf`,
        pdfExists: pdfExists
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error'
    });
  }
});

// Serve PDF files statically
app.use('/certificates', express.static(certsDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="certificate.pdf"');
    }
  }
}));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    certificatesDir: fs.existsSync(certsDir) ? 'exists' : 'missing'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Certificates directory: ${certsDir}`);
  console.log(`PDF endpoint: http://localhost:${PORT}/certificates/`);
});