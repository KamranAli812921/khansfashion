const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { authenticateToken, requireAdmin } = require('../utils/auth');

// Slugify helper
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')       // Replace spaces with -
    .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
    .replace(/\-\-+/g, '-');    // Replace multiple - with single -
};

// @route   GET /categories
// @desc    Get all categories (Public)
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    
    if (req.query.hasProducts === 'true') {
      const Product = require('../models/Product');
      const filteredCategories = [];
      for (let cat of categories) {
        const count = await Product.countDocuments({ category: cat.slug });
        if (count > 0) {
          filteredCategories.push(cat);
        }
      }
      return res.status(200).json(filteredCategories);
    }
    
    res.status(200).json(categories);
  } catch (error) {
    console.error('Fetch categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /admin/categories
// @desc    Create a category (Admin only)
router.post('/admin/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const slug = slugify(name);
    const existingCategory = await Category.findOne({ slug });

    if (existingCategory) {
      return res.status(400).json({ message: 'Category already exists' });
    }

    const category = new Category({ name, slug });
    await category.save();

    res.status(201).json({ message: 'Category created successfully', category });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
