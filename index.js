require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Enhanced Middleware
app.use(cors({
  origin: ['https://www.osheq.us', 'http://localhost:3000'],
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

// MongoDB Connection
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

// Course Schema
const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema, 'courses');

// Initialize default courses if they don't exist
async function initializeCourses() {
  try {
    const defaultCourses = ["OSHEQ Training", "Safety Training"];
    for (const courseName of defaultCourses) {
      await Course.findOneAndUpdate(
        { name: courseName },
        { $setOnInsert: { name: courseName } },
        { upsert: true, new: true }
      );
    }
    console.log('Courses initialized');
  } catch (err) {
    console.error('Error initializing courses:', err);
  }
}

// Certificate Schema
const certificateSchema = new mongoose.Schema({
  certificateNumber: { 
    type: String, 
    required: true, 
    unique: true,
    match: [/^OSHEQ-\d+$/, 'Please enter a valid certificate number']
  },
  dateofissue: {
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
    validate: {
      validator: async function(v) {
        const course = await Course.findOne({ name: v, isActive: true });
        return !!course;
      },
      message: props => `${props.value} is not a valid course name`
    },
    default: "OSHEQ Training"
  },
  dateofbirth: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
      },
      message: props => `${props.value} is not a valid date format (DD/MM/YYYY)`
    }
  },
  pdfFileName: {
    type: String,
    required: false
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true } 
});

const Certificate = mongoose.model('Certificate', certificateSchema, 'certificates');

// Get all active courses endpoint
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true }, 'name');
    res.json(courses.map(c => c.name));
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses' });
  }
});

// Enhanced Verify Certificate Endpoint
app.get('/api/certificates/verify', async (req, res) => {
  try {
    const { username, certificateNumber } = req.query;
    console.log(`Verification request for ${username} with cert ${certificateNumber}`);
    
    if (!username || !certificateNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both username and certificate number are required' 
      });
    }

    const certificate = await Certificate.findOne({ certificateNumber }).lean();
    console.log('Found certificate:', certificate);
    
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

    const pdfName = certificate.pdfFileName || `${certificate.certificateNumber}.pdf`;
    const pdfPath = path.join(certsDir, pdfName);
    const pdfExists = fs.existsSync(pdfPath);
    console.log(`PDF exists: ${pdfExists} at ${pdfPath}`);

    const responseData = {
      success: true,
      certificate: {
        holderName: certificate.username,
        certificateNumber: certificate.certificateNumber,
        courseName: certificate.courseName,
        dateOfIssue: certificate.dateofissue,
        dateOfBirth: certificate.dateofbirth,
        pdfUrl: pdfExists ? `/certificates/${pdfName}` : null,
        pdfExists,
        pdfFileName: certificate.pdfFileName
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Serve PDF files
app.use('/certificates', express.static(certsDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="certificate.pdf"');
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Health Check
app.get('/health', (req, res) => {
  const status = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    certificatesDir: fs.existsSync(certsDir) ? 'exists' : 'missing'
  };
  res.status(200).json(status);
});

const PORT = process.env.PORT || 5000;

// Initialize courses and start server
initializeCourses().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Certificates directory: ${certsDir}`);
    console.log(`PDF endpoint: http://localhost:${PORT}/certificates/`);
    console.log(`Courses endpoint: http://localhost:${PORT}/api/courses`);
  });
});
