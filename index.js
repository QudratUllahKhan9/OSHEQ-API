require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Enhanced Middleware
app.use(cors({
  origin: ['https://osheq.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure directories
const certsDir = path.join(__dirname, 'certificates');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
  console.log('Created certificates directory');
}

// MongoDB Connection with better error handling
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://wasimrahmanios444:bannu123@cluster0.vjdo0vv.mongodb.net/osheq?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Enhanced Certificate Schema with validation
const certificateSchema = new mongoose.Schema({
  certificateNumber: { 
    type: String, 
    required: true, 
    unique: true,
    match: [/^OSHEQ-\d+$/, 'Please enter a valid certificate number']
  },
  dateOfIssue: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
      },
      message: props => `${props.value} is not a valid date format (DD/MM/YYYY)`
    }
  },
  username: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  courseName: { 
    type: String, 
    required: true,
    default: "OSHEQ Training",
    enum: ["OSHEQ Training", "Safety Training"] // Add all your course names
  },
  dateOfBirth: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
      },
      message: props => `${props.value} is not a valid date format (DD/MM/YYYY)`
    }
  }
}, { timestamps: true });

const Certificate = mongoose.model('Certificate', certificateSchema, 'certificates');

// Enhanced Verify Certificate Endpoint
app.get('/api/certificates/verify', async (req, res) => {
  try {
    const { username, certificateNumber } = req.query;
    
    if (!username || !certificateNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both username and certificate number are required' 
      });
    }

    const certificate = await Certificate.findOne({ certificateNumber }).lean();
    
    if (!certificate) {
      return res.status(404).json({ 
        success: false, 
        message: 'Certificate not found' 
      });
    }
    
    if (certificate.username.toLowerCase() !== username.toLowerCase()) {
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
        dateOfIssue: certificate.dateOfIssue,
        dateOfBirth: certificate.dateOfBirth,
        pdfUrl: pdfExists ? `/certificates/${certificateNumber}.pdf` : null,
        pdfExists
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Serve PDF files statically with cache control
app.use('/certificates', express.static(certsDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="certificate.pdf"');
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    }
  }
}));

// Enhanced Health Check
app.get('/health', (req, res) => {
  const status = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    certificatesDir: fs.existsSync(certsDir) ? 'exists' : 'missing',
    memoryUsage: process.memoryUsage()
  };
  res.status(200).json(status);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something broke!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Certificates directory: ${certsDir}`);
  console.log(`PDF endpoint: http://localhost:${PORT}/certificates/`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});
