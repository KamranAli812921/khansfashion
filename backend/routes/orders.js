const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const CartItem = require('../models/CartItem');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary if credentials exist
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('Cloudinary service initialized successfully.');
} else {
  console.log('Cloudinary credentials missing in .env. Falling back to storing Base64 receipt images directly in MongoDB.');
}

// @route   POST /orders
// @desc    Place a new order (Checkout)
router.post('/orders', authenticateToken, async (req, res) => {
  try {
    const { items, address, paymentMethod } = req.body;

    if (!items || items.length === 0 || !address || !paymentMethod) {
      return res.status(400).json({ message: 'Order details are incomplete' });
    }

    // 1. Re-derive each item's price from the authoritative product record.
    // The client-supplied price/total are never trusted, otherwise a
    // tampered request body could check out at an arbitrary price.
    const verifiedItems = [];
    let total = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product "${item.name || item.productId}" not found` });
      }

      const qty = parseInt(item.qty, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: `Invalid quantity for "${product.name}"` });
      }

      let price = product.isOnSale && product.discountPrice ? product.discountPrice : product.price;
      if (product.sizePrices && product.sizePrices.length > 0 && item.size) {
        const matchingSizePrice = product.sizePrices.find(sp => sp.size === item.size);
        if (matchingSizePrice) {
          price = matchingSizePrice.discountPrice || matchingSizePrice.price;
        }
      }

      verifiedItems.push({
        productId: product._id,
        name: product.name,
        qty,
        price,
        size: item.size || null,
        color: item.color || null
      });

      total += price * qty;
    }

    // 2. Create the order
    const order = new Order({
      customerId: req.user.userId,
      items: verifiedItems,
      total,
      address,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending'
    });

    await order.save();

    // 3. Clear customer's CartItems from database
    await CartItem.deleteMany({ userId: req.user.userId });

    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (error) {
    console.error('Checkout place order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /orders/my
// @desc    Get order history for current customer
router.get('/orders/my', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.user.userId }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    console.error('Fetch customer orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /orders/:id
// @desc    Track order details by ID (Public)
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customerId', 'firstName lastName phone email');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(200).json(order);
  } catch (error) {
    console.error('Track order ID search error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /orders/:id/receipt
// @desc    Upload bank payment receipt screenshot (accepts base64 in json body)
router.post('/orders/:id/receipt', authenticateToken, async (req, res) => {
  try {
    const { receiptImage } = req.body;
    if (!receiptImage) {
      return res.status(400).json({ message: 'Receipt image data is required' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify ownership
    if (order.customerId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to upload receipt for this order' });
    }

    let finalImageUrl = receiptImage;

    // Upload to Cloudinary if available
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(receiptImage, {
          folder: 'bank_receipts'
        });
        finalImageUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload failure, using base64 direct fallback:', uploadError);
      }
    }

    order.receiptImage = finalImageUrl;
    await order.save();

    // Trigger Admin email notifications
    try {
      const admins = await User.find({ role: 'admin' });
      const adminEmails = admins.map(adm => adm.email).filter(email => email);

      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails.join(','),
          subject: `Payment Receipt Uploaded - Order #${order._id}`,
          text: `A payment receipt screenshot has been uploaded for Order #${order._id}. Customer Name: ${req.user.firstName || 'User'}. Total: PKR ${order.total}. Review it in the Admin Dashboard.`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; background-color: #0D0D0D; color: #F5F2ED;">
              <h2 style="color: #C9A227; border-bottom: 1px solid #1A1A1A; padding-bottom: 10px;">Payment Receipt Upload</h2>
              <p>A customer has uploaded a bank transfer receipt screenshot:</p>
              <div style="margin: 20px 0; background: #1A1A1A; padding: 15px; border-radius: 4px;">
                <strong>Order ID:</strong> ${order._id}<br>
                <strong>Total Amount:</strong> PKR ${order.total.toLocaleString()}<br>
                <strong>Customer ID:</strong> ${order.customerId}
              </div>
              <p>Please log in to the admin panel to review and confirm this payment.</p>
            </div>
          `
        });
      }
    } catch (emailErr) {
      console.error('Admin notification email failed to fire:', emailErr);
    }

    res.status(200).json({ message: 'Receipt uploaded successfully', order });
  } catch (error) {
    console.error('Receipt upload endpoint error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ==========================================
   ADMIN ONLY ORDER ENDPOINTS
   ========================================== */

// @route   GET /admin/orders
// @desc    Get all orders with optional status filters and limit limits (Admin only)
router.get('/admin/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit } = req.query;
    let query = {};

    if (status && status !== 'all') {
      query.orderStatus = status;
    }

    let queryBuilder = Order.find(query).populate('customerId', 'firstName lastName email phone').sort({ createdAt: -1 });

    if (limit) {
      queryBuilder = queryBuilder.limit(parseInt(limit));
    }

    const orders = await queryBuilder;
    res.status(200).json(orders);
  } catch (error) {
    console.error('Admin retrieve orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /admin/orders/:id/status
// @desc    Update orderStatus or paymentStatus (Admin only)
router.patch('/admin/orders/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (orderStatus) {
      order.orderStatus = orderStatus;
      if (orderStatus === 'delivered' && order.paymentMethod === 'cod') {
        order.paymentStatus = 'received';
      }
    }
    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();
    res.status(200).json({ message: 'Order status updated successfully', order });
  } catch (error) {
    console.error('Admin update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /admin/orders/overview
// @desc    Retrieve statistics for dashboard (Admin only)
router.get('/admin/orders/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingPayment = await Order.countDocuments({ paymentMethod: 'bank_transfer', paymentStatus: 'pending' });
    const paymentReceived = await Order.countDocuments({ paymentStatus: 'received' });
    const delivered = await Order.countDocuments({ orderStatus: 'delivered' });

    res.status(200).json({
      totalOrders,
      pendingPayment,
      paymentReceived,
      delivered
    });
  } catch (error) {
    console.error('Dashboard metrics calculation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
