const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../utils/auth');

// @route   GET /products/:productId/reviews
// @desc    Get all reviews for a product and check if current user can review (Public)
router.get('/products/:productId/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.productId }).sort({ createdAt: -1 });
    
    // Check if user is authenticated
    let canReview = false;
    let purchaseRequired = true;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        if (decoded && decoded.role !== 'admin') {
          const existingReview = await Review.findOne({ productId: req.params.productId, customerId: decoded.userId });
          if (!existingReview) {
            const Order = require('../models/Order');
            const hasBought = await Order.findOne({
              customerId: decoded.userId,
              'items.productId': req.params.productId,
              orderStatus: 'delivered'
            });
            if (hasBought) {
              canReview = true;
              purchaseRequired = false;
            }
          } else {
            purchaseRequired = false;
          }
        } else {
          purchaseRequired = false;
        }
      } catch (err) {
        // Ignore invalid token
      }
    }
    
    res.status(200).json({ reviews, canReview, purchaseRequired });
  } catch (error) {
    console.error('Fetch product reviews error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /products/:productId/reviews
// @desc    Submit a review for a product (Customer only, verified purchase required)
router.post('/products/:productId/reviews', authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const { productId } = req.params;

    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }

    const ratingVal = parseInt(rating) || 5;
    if (ratingVal < 1 || ratingVal > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Admins cannot review products' });
    }

    const existingReview = await Review.findOne({ productId, customerId: user._id });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already submitted a review for this product.' });
    }

    const Order = require('../models/Order');
    const hasBought = await Order.findOne({
      customerId: user._id,
      'items.productId': productId,
      orderStatus: 'delivered'
    });

    if (!hasBought) {
      return res.status(403).json({ 
        message: 'Only customers who have purchased this product and received delivery can leave a review.' 
      });
    }

    const review = new Review({
      productId,
      customerId: user._id,
      customerName: `${user.firstName} ${user.lastName}`,
      rating: ratingVal,
      comment
    });

    await review.save();
    res.status(201).json({ message: 'Review submitted successfully', review });
  } catch (error) {
    console.error('Submit product review error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /admin/reviews
// @desc    Get all reviews across all products (Admin only)
router.get('/admin/reviews', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('productId', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (error) {
    console.error('Fetch all reviews error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /admin/reviews/:id/reply
// @desc    Reply to product review (Admin only)
router.patch('/admin/reviews/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { adminReply } = req.body;
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          adminReply: adminReply || null,
          repliedAt: adminReply ? new Date() : null
        }
      },
      { new: true }
    ).populate('productId', 'name');

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    res.status(200).json({ message: 'Reply saved successfully', review });
  } catch (error) {
    console.error('Admin reply to review error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
