const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../utils/auth');

// @route   GET /users/me
// @desc    Get current user details (Authenticated)
router.get('/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error('Fetch me profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /users/me
// @desc    Update current user profile information (Authenticated)
router.patch('/users/me', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phone, address } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (firstName) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone) user.phone = phone;
    
    if (address) {
      user.address = {
        street: address.street !== undefined ? address.street : user.address.street,
        city: address.city !== undefined ? address.city : user.address.city,
        area: address.area !== undefined ? address.area : user.address.area
      };
    }

    await user.save();

    // Map output to exclude passwordHash
    const updatedUser = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      address: user.address
    };

    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Update me profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
