const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendEmail } = require('../utils/email');
const { generateAccessToken, generateRefreshToken } = require('../utils/auth');

// Generate 6 digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Login/signup abuse is throttled per IP: without this, a 6-digit OTP or a
// user's password can be brute-forced directly against the API with no lockout.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP attempts. Please try again in a few minutes.' }
});

// @route   POST /auth/signup
// @desc    Register user (defaults to customer, requires verification)
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, address } = req.body;

    if (!firstName || !email || !phone || !password) {
      return res.status(400).json({ message: 'Please enter all required fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const existingUser = await User.findOne({ email });

    let user;
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      // If user exists but is unverified, overwrite their details and generate a new OTP
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      existingUser.firstName = firstName;
      existingUser.lastName = lastName;
      existingUser.phone = phone;
      existingUser.passwordHash = passwordHash;
      if (address) {
        existingUser.address = {
          street: address.street || '',
          city: address.city || '',
          area: address.area || ''
        };
      }
      user = await existingUser.save();
    } else {
      // Create new user
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Check if this is the very first user in the database. If so, make them an admin!
      // This is a common and practical helper for local setups so the user doesn't have to manually edit DB roles.
      const userCount = await User.countDocuments();
      const role = userCount === 0 ? 'admin' : 'customer';

      user = new User({
        firstName,
        lastName,
        email,
        phone,
        passwordHash,
        address: address ? {
          street: address.street || '',
          city: address.city || '',
          area: address.area || ''
        } : {},
        role,
        isVerified: false
      });
      await user.save();
    }

    // Generate & save OTP
    const otpCode = generateOTP();
    await OTP.findOneAndUpdate(
      { email: email.toLowerCase() },
      { otp: otpCode, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // Send email with OTP in the background (non-blocking)
    sendEmail({
      to: user.email,
      subject: "Verify your Khan's Fashion account",
      text: `Your verification code is: ${otpCode}. It will expire in 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #0D0D0D; color: #F5F2ED;">
          <h2 style="color: #C9A227; border-bottom: 1px solid #1A1A1A; padding-bottom: 10px;">Verification Code</h2>
          <p>Thank you for signing up. Please enter the following OTP to verify your account:</p>
          <div style="font-size: 24px; font-weight: bold; color: #C9A227; margin: 20px 0; background: #1A1A1A; padding: 15px; border-radius: 4px; display: inline-block; letter-spacing: 2px;">
            ${otpCode}
          </div>
          <p style="color: #8A8A8A; font-size: 12px;">This OTP will expire in 5 minutes.</p>
        </div>
      `
    }).catch(mailErr => {
      console.error('Failed to send verification email in background:', mailErr);
    });

    res.status(201).json({
      message: 'Signup successful! An OTP verification email has been sent.',
      email: user.email
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /auth/verify-otp
// @desc    Verify OTP and activate user account
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const otpRecord = await OTP.findOne({ email: email.toLowerCase(), otp });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isVerified = true;
    await user.save();

    // Delete OTP record
    await OTP.deleteOne({ _id: otpRecord._id });

    // Generate JWTs
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(200).json({
      message: 'OTP verified successfully!',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /auth/login
// @desc    Login user & return JWT tokens
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is verified
    if (!user.isVerified) {
      // Re-trigger OTP
      const otpCode = generateOTP();
      await OTP.findOneAndUpdate(
        { email: user.email },
        { otp: otpCode, createdAt: new Date() },
        { upsert: true, new: true }
      );

      // Send email with OTP in the background (non-blocking)
      sendEmail({
        to: user.email,
        subject: "Verify your Khan's Fashion account",
        text: `Your verification code is: ${otpCode}. It will expire in 5 minutes.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; background-color: #0D0D0D; color: #F5F2ED;">
            <h2 style="color: #C9A227; border-bottom: 1px solid #1A1A1A; padding-bottom: 10px;">Verification Code Required</h2>
            <p>Your account is not yet verified. Please enter the following OTP to verify your account:</p>
            <div style="font-size: 24px; font-weight: bold; color: #C9A227; margin: 20px 0; background: #1A1A1A; padding: 15px; border-radius: 4px; display: inline-block; letter-spacing: 2px;">
              ${otpCode}
            </div>
            <p style="color: #8A8A8A; font-size: 12px;">This OTP will expire in 5 minutes.</p>
          </div>
        `
      }).catch(mailErr => {
        console.error('Failed to send login verification email in background:', mailErr);
      });

      return res.status(403).json({
        message: 'Account not verified. A verification email has been sent.',
        isVerified: false,
        email: user.email
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWTs
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(200).json({
      message: 'Login successful!',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
