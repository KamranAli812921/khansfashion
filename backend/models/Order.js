const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  size: { type: String, default: null },
  color: { type: String, default: null }
}, { _id: false });

const OrderAddressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  area: { type: String, required: true }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [OrderItemSchema],
  total: { type: Number, required: true },
  address: { type: OrderAddressSchema, required: true },
  paymentMethod: { type: String, enum: ['cod', 'bank_transfer'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'received'], default: 'pending' },
  receiptImage: { type: String }, // Cloudinary URL or local fallback path
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', OrderSchema);
