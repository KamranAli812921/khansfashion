const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const users = await User.find({});
  console.log('Registered Users:');
  users.forEach(u => {
    console.log(`- ${u.firstName} ${u.lastName} (${u.email}) [Role: ${u.role}] [Verified: ${u.isVerified}]`);
  });
  
  await mongoose.disconnect();
}

check();
