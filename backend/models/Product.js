const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  category: { type: String, default: 'uncategorized' }, // slug reference
  images: [{ type: String }],
  videos: [{ type: String }],
  isOnSale: { type: Boolean, default: false },
  sizes: [{ type: String }],
  colors: [{ type: String }],
  // Maps a color name to the index of its representative photo in `images`,
  // so the storefront can swap the shown picture when a customer picks that color.
  colorImages: [{
    color: { type: String, required: true },
    imageIndex: { type: Number, required: true }
  }],
  sizePrices: [{
    size: { type: String, required: true },
    price: { type: Number, required: true },
    discountPrice: { type: Number }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', ProductSchema);
