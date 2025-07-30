const express = require('express');
const router = express.Router();
const Certificate = require('../models/Certificate');

// GET endpoint to verify certificate
router.get('/verify', async (req, res) => {
  const { username, certificateNumber } = req.query;

  try {
    const certificate = await Certificate.findOne({
      username: username,
      certificateNumber: certificateNumber,
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    return res.status(200).json(certificate);
  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
