const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  street: { type: String, default: '' },
  city: { type: String, default: '' },
  area: { type: String, default: '' }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  address: { type: AddressSchema, default: () => ({}) },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  isVerified: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
