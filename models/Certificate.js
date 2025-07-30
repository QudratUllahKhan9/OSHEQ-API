const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  username: String,
  certificateNumber: String,
  email: String,
  subject: String,
  message: String,
});

module.exports = mongoose.model('Certificate', certificateSchema);
