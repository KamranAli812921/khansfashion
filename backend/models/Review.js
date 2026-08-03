const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
  comment: { type: String, required: true },
  adminReply: { type: String, default: null },
  repliedAt: { type: Date }
}, {
  timestamps: true
});

// Ensure a customer can only leave one review per product
ReviewSchema.index({ productId: 1, customerId: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);
