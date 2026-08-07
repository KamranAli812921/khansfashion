const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const AdminSettings = require('../models/AdminSettings');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const { uploadFile } = require('../utils/uploader');

// Helper to process arrays of images/videos (URLs pass through, base64 data URLs get uploaded)
const processMedia = async (mediaArray, folder) => {
  if (!Array.isArray(mediaArray)) return [];
  const urls = [];
  for (const item of mediaArray) {
    if (item && item.startsWith('data:')) {
      const uploadedUrl = await uploadFile(item, folder);
      if (uploadedUrl) urls.push(uploadedUrl);
    } else if (item) {
      urls.push(item);
    }
  }
  return urls;
};

// @route   GET /products
// @desc    Get all products with category filtering & name searching
router.get('/products', async (req, res) => {
  try {
    const { category, search, isOnSale } = req.query;
    let query = {};

    if (category && category !== 'all') {
      query.category = category;
    }

    if (search) {
      query.name = { $regex: search, $options: 'i' }; // Case-insensitive regex search
    }

    if (isOnSale === 'true') {
      query.isOnSale = true;
    }

    const products = await Product.find(query).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error('Fetch products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /products/:id
// @desc    Get product details by ID
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error('Fetch product by ID error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /admin/products
// @desc    Create a new product (Admin only)
router.post('/admin/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, discountPrice, category, images, videos, isOnSale, sizes, colors, sizePrices } = req.body;

    if (!name || !description || !price) {
      return res.status(400).json({ message: 'Please enter all required fields' });
    }

    const processedImages = await processMedia(images, 'products');
    const processedVideos = await processMedia(videos, 'products');

    const product = new Product({
      name,
      description,
      price,
      discountPrice,
      category: category || 'uncategorized',
      images: processedImages,
      videos: processedVideos,
      isOnSale: isOnSale || false,
      sizes: sizes || [],
      colors: colors || [],
      sizePrices: sizePrices || []
    });

    await product.save();

    // Fetch all registered customers to notify them asynchronously
    User.find({ role: 'customer' }, 'email firstName').then(customers => {
      if (customers && customers.length > 0) {
        // Construct storefront product link using host domain (default fallback is localhost:5000 if no header matches)
        const host = req.get('host') || 'localhost:5000';
        const protocol = req.protocol || 'http';
        const productUrl = `${protocol}://${host}/#product-${product._id}`;
        
        customers.forEach(cust => {
          sendEmail({
            to: cust.email,
            subject: `New Arrival: Check out "${product.name}"!`,
            text: `Hi ${cust.firstName},\n\nA new product has been added to our catalog: "${product.name}".\nPrice: PKR ${product.price.toLocaleString()}\nCategory: ${product.category}\n\nDescription:\n${product.description}\n\nView it now on our storefront: ${productUrl}\n\nHappy Shopping!`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #C5838D; border-bottom: 2px solid #C5838D; padding-bottom: 10px; margin-top: 0;">New Arrival at Khan's Fashion!</h2>
                <p>Hi <strong>${cust.firstName}</strong>,</p>
                <p>We are thrilled to announce a new addition to our collection:</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #C5838D;">
                  <h3 style="margin-top: 0; color: #333;">${product.name}</h3>
                  <p style="margin: 5px 0;"><strong>Category:</strong> ${product.category}</p>
                  <p style="margin: 5px 0; font-size: 1.1rem; color: #c9a227;"><strong>Price:</strong> PKR ${product.price.toLocaleString()}</p>
                  <p style="margin: 10px 0; line-height: 1.5; color: #555;">${product.description}</p>
                </div>
                <p style="text-align: center; margin-top: 30px;">
                  <a href="${productUrl}" style="background-color: #C5838D; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">View Product Details</a>
                </p>
                <hr style="border: 0; border-top: 1px solid #eaeaea; margin-top: 30px;">
                <p style="font-size: 0.8rem; color: #999; text-align: center;">You received this email because you registered an account with Khan's Fashion.</p>
              </div>
            `
          }).catch(err => {
            console.error(`Failed to send product notification email to ${cust.email}:`, err);
          });
        });
      }
    }).catch(err => {
      console.error('Error querying users for product email notifications:', err);
    });

    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /admin/products/:id
// @desc    Modify product details (Admin only)
router.patch('/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const fieldsToUpdate = { ...req.body };

    if (fieldsToUpdate.images) {
      fieldsToUpdate.images = await processMedia(fieldsToUpdate.images, 'products');
    }
    if (fieldsToUpdate.videos) {
      fieldsToUpdate.videos = await processMedia(fieldsToUpdate.videos, 'products');
    }
    
    // Perform standard Mongoose update
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: fieldsToUpdate },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ message: 'Product updated successfully', product });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /admin/products/:id
// @desc    Delete a product (Admin only)
router.delete('/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /seed
// @desc    Seed categories, products, and bank accounts settings for testing
router.get('/seed', async (req, res) => {
  try {
    // Delete existing categories, products, adminsettings
    await Category.deleteMany({});
    await Product.deleteMany({});
    await AdminSettings.deleteMany({});

    // Seed categories
    const categories = await Category.insertMany([
      { name: 'Luxury Watches', slug: 'luxury-watches' },
      { name: 'Premium Leather', slug: 'premium-leather' },
      { name: 'Suits & Apparel', slug: 'suits-apparel' }
    ]);

    // Seed products
    const products = await Product.insertMany([
      {
        name: 'Aura Sovereign Gold Watch',
        description: 'An exquisite watch with real 24k gold bezel finish, sapphire glass, and a premium black leather strap.',
        price: 85000,
        category: 'luxury-watches',
        images: ['https://images.unsplash.com/photo-1547996160-81dfa63595aa?q=80&w=600'],
        videos: [],
        isOnSale: false
      },
      {
        name: 'Royal Obsidian Chronograph',
        description: 'Featuring a deep black matte finish, scratch-resistant dial, and quartz precision mechanism. Styled for luxury.',
        price: 65000,
        category: 'luxury-watches',
        images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600'],
        videos: [],
        isOnSale: true,
        discountPrice: 59000
      },
      {
        name: 'Classic Heritage Leather Duffle',
        description: 'Hand-stitched full-grain cowhide leather duffle bag with heavy-duty brass zippers. The perfect luxury weekend travel companion.',
        price: 32000,
        category: 'premium-leather',
        images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=600'],
        videos: [],
        isOnSale: false
      },
      {
        name: 'Premium Charcoal Cashmere Suit',
        description: 'Finest Italian cashmere blend double-breasted suit. Tailored to perfection for elite luxury and comfort.',
        price: 110000,
        category: 'suits-apparel',
        images: ['https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=600'],
        videos: [],
        isOnSale: false
      }
    ]);

    // Seed admin bank settings
    const settings = new AdminSettings({
      bankAccounts: [
        {
          bankName: 'Habib Bank Limited (HBL)',
          accountTitle: "Khan's Fashion Pakistan",
          accountNumber: '0042-12345678-03',
          iban: 'PK42HABB0000004212345678'
        }
      ],
      whatsappNumber: '923001234567'
    });
    await settings.save();

    res.status(200).json({
      message: 'Database seeded successfully!',
      categoriesCount: categories.length,
      productsCount: products.length,
      bankSettingsCreated: true
    });
  } catch (error) {
    console.error('Seeding database error:', error);
    res.status(500).json({ message: 'Server error during seeding' });
  }
});

module.exports = router;
