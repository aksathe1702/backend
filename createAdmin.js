// createAdmin.js
import Admin from './models/Admin.js';

export default async function createAdmin() {
  const existingAdmin = await Admin.findOne({ email: "admin@gmail.com" });

  if (existingAdmin) {
    console.log('Admin already exists');
    return;
  }

  const admin = new Admin({
    firstName: "Admin",
    lastName: "Test",
    email: "admin@gmail.com",
    password: "admin123", // Make sure it's hashed in your schema!
    role: "admin"
  });

  try {
    await admin.save();
    console.log('Admin created successfully');
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}
