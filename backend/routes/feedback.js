const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const User = require('../models/User');

// @route   GET /feedback
// @desc    Get all feedback and answers (Public)
router.get('/feedback', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    res.status(200).json(feedbacks);
  } catch (error) {
    console.error('Fetch feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /feedback
// @desc    Submit feedback (Customer only)
router.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Feedback message is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const feedback = new Feedback({
      customerId: user._id,
      customerName: `${user.firstName} ${user.lastName}`,
      message
    });

    await feedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /admin/feedback/:id/reply
// @desc    Reply to customer feedback (Admin only)
router.patch('/admin/feedback/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { adminReply } = req.body;

    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          adminReply: adminReply || null,
          repliedAt: adminReply ? new Date() : null
        }
      },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback item not found' });
    }

    res.status(200).json({ message: 'Reply updated successfully', feedback });
  } catch (error) {
    console.error('Admin reply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
