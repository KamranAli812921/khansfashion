const express = require('express');
const router = express.Router();
const CartItem = require('../models/CartItem');
const { authenticateToken } = require('../utils/auth');

// @route   GET /cart
// @desc    Get user cart items
router.get('/cart', authenticateToken, async (req, res) => {
  try {
    const items = await CartItem.find({ userId: req.user.userId })
      .populate('productId')
      .sort({ createdAt: -1 });
    
    // Filter out items where product might have been deleted in DB
    const validItems = items.filter(item => item.productId !== null);
    res.status(200).json(validItems);
  } catch (error) {
    console.error('Fetch cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /cart/add
// @desc    Add product to cart or increment quantity
router.post('/cart/add', authenticateToken, async (req, res) => {
  try {
    const { productId, qty, size, color } = req.body;
    const addQty = parseInt(qty) || 1;

    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    const query = { 
      userId: req.user.userId, 
      productId, 
      size: size || null, 
      color: color || null 
    };

    let cartItem = await CartItem.findOne(query);

    if (cartItem) {
      cartItem.qty += addQty;
      await cartItem.save();
    } else {
      cartItem = new CartItem({
        userId: req.user.userId,
        productId,
        qty: addQty,
        size: size || null,
        color: color || null
      });
      await cartItem.save();
    }

    res.status(200).json({ message: 'Item added to cart', cartItem });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /cart/update
// @desc    Update quantity of item in cart
router.patch('/cart/update', authenticateToken, async (req, res) => {
  try {
    const { productId, qty, size, color } = req.body;

    if (!productId || qty === undefined) {
      return res.status(400).json({ message: 'Product ID and quantity are required' });
    }

    const query = { 
      userId: req.user.userId, 
      productId, 
      size: size || null, 
      color: color || null 
    };

    const newQty = parseInt(qty);
    if (newQty <= 0) {
      await CartItem.deleteOne(query);
      return res.status(200).json({ message: 'Item removed from cart' });
    }

    const cartItem = await CartItem.findOneAndUpdate(
      query,
      { $set: { qty: newQty } },
      { new: true }
    );

    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    res.status(200).json({ message: 'Cart updated', cartItem });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /cart/remove
// @desc    Remove item from cart
router.delete('/cart/remove', authenticateToken, async (req, res) => {
  try {
    const { productId, size, color } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    const query = { 
      userId: req.user.userId, 
      productId, 
      size: size || null, 
      color: color || null 
    };

    await CartItem.deleteOne(query);
    res.status(200).json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
