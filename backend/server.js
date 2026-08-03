const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const path = require('path');
const { verifyEmailConfig } = require('./utils/email');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for multiple product images/videos
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve backend local uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routing
app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/products'));
app.use('/', require('./routes/categories'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/orders'));
app.use('/', require('./routes/settings'));
app.use('/', require('./routes/users'));
app.use('/', require('./routes/reviews'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Database connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';

mongoose.connect(mongoURI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
  })
  .catch((err) => {
    console.error('MongoDB connection failure details:', err);
    console.log('Ensure that local MongoDB is running or that your MONGODB_URI is correctly set in .env.');
  });

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  verifyEmailConfig();
});

module.exports = server; // Exported for testing/verification
