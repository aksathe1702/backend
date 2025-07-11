import express from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import Doctor from '../models/Doctor.js';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';

dotenv.config();

const router = express.Router();

// Middleware to verify JWT token
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).send({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id) {
      return res.status(401).send({ error: 'Invalid token payload' });
    }
    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    res.status(401).send({ error: 'Invalid token' });
  }
};

// Admin login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin add doctor
router.post('/add-doctor', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ error: 'Not authorized to add doctors' });
  }

  const { firstName, lastName, email, specialty, licenseNumber, phoneNumber, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const doctor = new Doctor({
      firstName,
      lastName,
      email,
      specialty,
      licenseNumber,
      phoneNumber,
      password: hashedPassword,
    });

    await doctor.save();
    res.status(201).send({ message: 'Doctor added successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).send({ error: 'Email or license number already exists' });
    }
    res.status(400).send({ error: error.message });
  }
});

// Admin add another admin
router.post('/add-admin', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ error: 'Not authorized to add admins' });
  }

  const { firstName, lastName, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new Admin({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    await admin.save();
    res.status(201).send({ message: 'Admin added successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).send({ error: 'Email already exists' });
    }
    res.status(400).send({ error: error.message });
  }
});

// Admin profile fetch
router.get('/profile', auth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select('-password');
    if (!admin) {
      return res.status(404).send({ error: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin profile update
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const admin = await Admin.findById(req.user.id);

    if (!admin) {
      return res.status(404).send({ error: 'Admin not found' });
    }

    admin.firstName = firstName || admin.firstName;
    admin.lastName = lastName || admin.lastName;
    admin.email = email || admin.email;

    await admin.save();

    const adminWithoutPassword = admin.toObject();
    delete adminWithoutPassword.password;

    res.json({ message: 'Profile updated successfully', admin: adminWithoutPassword });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Total doctors
router.get('/total-doctors', auth, async (req, res) => {
  try {
    const totalDoctors = await Doctor.countDocuments();
    res.json({ totalDoctors });
  } catch (error) {
    console.error('Error fetching total doctors:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Total patients
router.get('/total-patients', auth, async (req, res) => {
  try {
    const totalPatients = await User.countDocuments({ role: 'patient' });
    res.json({ totalPatients });
  } catch (error) {
    console.error('Error fetching total patients:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Doctor overview
router.get('/doctor-overview', auth, async (req, res) => {
  try {
    const doctors = await Doctor.find().select('firstName lastName specialty');

    const doctorOverview = await Promise.all(doctors.map(async (doctor) => {
      const uniquePatients = await Appointment.distinct('patientId', { doctorId: doctor._id });
      return {
        name: `${doctor.firstName} ${doctor.lastName}`,
        specialty: doctor.specialty,
        patients: uniquePatients.length
      };
    }));

    res.json(doctorOverview);
  } catch (error) {
    console.error('Error fetching doctor overview:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Patient overview
router.get('/patient-overview', auth, async (req, res) => {
  try {
    const patients = await User.find({ role: 'patient' }).select('firstName lastName');

    const patientOverview = await Promise.all(patients.map(async (patient) => {
      const appointmentCount = await Appointment.countDocuments({ patientId: patient._id });
      return {
        name: `${patient.firstName} ${patient.lastName}`,
        appointments: appointmentCount
      };
    }));

    res.json(patientOverview);
  } catch (error) {
    console.error('Error fetching patient overview:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Completed/cancelled appointments
router.get('/appointment/completed-cancelled', auth, async (req, res) => {
  try {
    const appointments = await Appointment.find({
      status: { $in: ['completed', 'cancelled'] }
    })
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName')
      .sort({ date: -1 }); // Latest first

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching completed/cancelled appointments:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Upcoming appointments
router.get('/appointments/upcoming', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const upcomingAppointments = await Appointment.find({
      status: 'scheduled',
      date: { $gte: today }
    })
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName')
      .sort({ date: 1, time: 1 });

    res.json(upcomingAppointments);
  } catch (error) {
    console.error('Error fetching upcoming appointments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
