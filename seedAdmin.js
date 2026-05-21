const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'dheerajk.jk@gmail.com' });

    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists in database. Skipping seed.');
    } else {
      const adminUser = new User({
        name: 'Dheeraj Kumar',
        email: 'dheerajk.jk@gmail.com',
        password: 'Ration',
        role: 'admin',
        department: 'Ration Distribution Department',
        permissions: ['approve', 'reject', 'view_all', 'manage_users'],
      });

      await adminUser.save();
      console.log('✅ Admin user created successfully!');
      console.log('   Email   : dheerajk.jk@gmail.com');
      console.log('   Password: Ration');
      console.log('   Role    : admin');
    }

    mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
};

seedAdmin();
