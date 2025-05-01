import express from 'express';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Admin from '../models/Admin.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

router.post('/', async (req, res) => {
  console.log("➡️ Login API called");

  const { email, password, role } = req.body;

  console.log('➡️ Received data:', { email, role });

  try {
    if (!email || !password || !role) {
      console.log('❌ Missing email, password, or role');
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    let user;

    if (role === 'doctor') {
      user = await Doctor.findOne({ email });
    } else if (role === 'admin') {
      user = await Admin.findOne({ email });
    } else {
      user = await User.findOne({ email, role });
    }

    if (!user) {
      console.log('❌ No user found with this email and role');
      return res.status(400).json({ error: 'Invalid email or role' });
    }

    if (!user.password) {
      console.log('❌ User record has no password');
      return res.status(400).json({ error: 'Invalid user data' });
    }

    // Log the hashed password to verify it
    console.log('➡️ User password hash in DB:', user.password);

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(400).json({ error: 'Invalid password' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Token created successfully');
    return res.status(200).json({ token, role: user.role });

  } catch (error) {
    console.error("🔥 Login API Error:", error.message, error.stack);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
