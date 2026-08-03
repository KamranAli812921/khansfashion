const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  qty: { type: Number, required: true, min: 1 },
  size: { type: String, default: null },
  color: { type: String, default: null }
}, {
  timestamps: true
});

// Ensure unique combination of userId, productId, size, and color
CartItemSchema.index({ userId: 1, productId: 1, size: 1, color: 1 }, { unique: true });

module.exports = mongoose.model('CartItem', CartItemSchema);
