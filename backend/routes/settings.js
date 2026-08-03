const express = require('express');
const router = express.Router();
const AdminSettings = require('../models/AdminSettings');
const { authenticateToken, requireAdmin } = require('../utils/auth');

// @route   GET /admin/settings/bank
// @desc    Get active bank accounts list (Publicly read by checkout page)
router.get('/admin/settings/bank', async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();
    if (!settings) {
      // Seed a default config if it doesn't exist
      settings = new AdminSettings({ bankAccounts: [] });
      await settings.save();
    }
    res.status(200).json(settings);
  } catch (error) {
    console.error('Fetch bank accounts settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /admin/settings/bank
// @desc    Modify settings (Admin only)
router.patch('/admin/settings/bank', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { bankAccounts, whatsappNumber } = req.body;

    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings({
        bankAccounts: bankAccounts || [],
        whatsappNumber: whatsappNumber || ''
      });
    } else {
      if (bankAccounts !== undefined) {
        if (!Array.isArray(bankAccounts)) {
          return res.status(400).json({ message: 'bankAccounts must be an array' });
        }
        settings.bankAccounts = bankAccounts;
      }
      if (whatsappNumber !== undefined) {
        settings.whatsappNumber = whatsappNumber;
      }
    }

    await settings.save();
    res.status(200).json({ message: 'Settings updated', settings });
  } catch (error) {
    console.error('Save settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
