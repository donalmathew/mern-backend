const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const Organization = require('../models/Organization');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const seedAdmin = async () => {
  try {
    // Check if admin already exists
    const existingAdmin = await Organization.findOne({ level: 0 });
    
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.name);
      process.exit(0);
    }
    
    // Create admin password
    const password = 'admin123'; // Change this to a secure password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin user (CGPU as per your example)
    const admin = new Organization({
      name: 'CGPU',
      orgId: 'admin',
      password: hashedPassword,
      level: 0,
      isVenueManager: true
    });
    
    await admin.save();
    
    console.log('Admin user created successfully:');
    console.log('Name:', admin.name);
    console.log('Organization ID:', admin.orgId);
    console.log('Password:', password); // Display the password for first-time setup
    console.log('Level:', admin.level);
    console.log('Is Venue Manager:', admin.isVenueManager);
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
};

// Run the seed function
seedAdmin(); 