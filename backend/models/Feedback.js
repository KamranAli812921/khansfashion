const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerName: { type: String, required: true },
  message: { type: String, required: true },
  adminReply: { type: String, default: null },
  repliedAt: { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
