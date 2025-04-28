import express from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import User from '../models/User.js';
import Prescription from '../models/Prescription.js';

dotenv.config();

const router = express.Router();

// Middleware for authentication
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).send({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Invalid token' });
  }
};

// Get doctor profile
router.get('/profile', auth, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id).select('-password');
    if (!doctor) {
      return res.status(404).send({ error: 'Doctor not found' });
    }
    res.json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Update doctor profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, email, specialty, licenseNumber, phoneNumber } = req.body;
    const doctor = await Doctor.findById(req.user.id);

    if (!doctor) {
      return res.status(404).send({ error: 'Doctor not found' });
    }

    doctor.firstName = firstName;
    doctor.lastName = lastName;
    doctor.email = email;
    doctor.specialty = specialty;
    doctor.licenseNumber = licenseNumber;
    doctor.phoneNumber = phoneNumber;
    await doctor.save();

    const doctorWithoutPassword = doctor.toObject();
    delete doctorWithoutPassword.password;

    res.json(doctorWithoutPassword);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Get all doctors
router.get('/all', async (req, res) => {
  try {
    const doctors = await Doctor.find().select('firstName lastName specialty');
    res.json(doctors);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Get patients with appointments
router.get('/patients-with-appointments', auth, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const appointments = await Appointment.find({ doctorId }).sort({ date: 1 });

    const patientIds = [...new Set(appointments.map(app => app.patientId.toString()))];

    const patients = await User.find({ _id: { $in: patientIds }, role: 'patient' });

    const patientsWithAppointments = patients.map(patient => {
      const patientAppointments = appointments.filter(app => app.patientId.toString() === patient._id.toString());
      const lastVisit = patientAppointments.find(app => new Date(app.date) < new Date());
      const nextAppointment = patientAppointments.find(app => new Date(app.date) >= new Date());

      return {
        ...patient.toObject(),
        lastVisit: lastVisit ? lastVisit.date : null,
        nextAppointment: nextAppointment ? nextAppointment.date : null
      };
    });

    res.json(patientsWithAppointments);
  } catch (error) {
    console.error('Error fetching patients with appointments:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Get available slots
router.get('/available-slots', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const doctorId = req.user.id;

    const bookedAppointments = await Appointment.find({ doctorId, date });
    const bookedTimes = bookedAppointments.map(app => app.time);

    const allTimeSlots = ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];

    const availableSlots = allTimeSlots.filter(slot => !bookedTimes.includes(slot));

    res.json(availableSlots);
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Schedule an appointment
router.post('/schedule-appointment', auth, async (req, res) => {
  try {
    const { patientId, date, time, reason } = req.body;
    const doctorId = req.user.id;

    const appointment = new Appointment({
      patientId,
      doctorId,
      date,
      time,
      reason
    });

    await appointment.save();
    res.status(201).json({ message: 'Appointment scheduled successfully', appointment });
  } catch (error) {
    console.error('Error scheduling appointment:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Prescribe medication
router.post('/prescribe-medication', auth, async (req, res) => {
  try {
    const { patientId, medication, dosage, frequency, tilldate } = req.body;
    const doctorId = req.user.id;

    const prescription = new Prescription({
      patientId,
      doctorId,
      medication,
      dosage,
      frequency,
      tilldate
    });

    const savedPrescription = await prescription.save();

    res.status(201).json({ message: 'Medication prescribed successfully', prescription: savedPrescription });
  } catch (error) {
    console.error('Error prescribing medication:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Get all prescriptions for doctor
router.get('/prescriptions', auth, async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ doctorId: req.user.id });
    res.json(prescriptions);
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Get prescriptions by patient
router.get('/prescriptions/patient/:patientId', auth, async (req, res) => {
  try {
    const prescriptions = await Prescription.find({
      doctorId: req.user.id,
      patientId: req.params.patientId
    });
    res.json(prescriptions);
  } catch (error) {
    console.error('Error fetching prescriptions by patient:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Update a prescription
router.put('/prescriptions/:id', auth, async (req, res) => {
  try {
    const { medication, dosage, frequency, tilldate } = req.body;
    const prescription = await Prescription.findOneAndUpdate(
      { _id: req.params.id, doctorId: req.user.id },
      { medication, dosage, frequency, tilldate },
      { new: true }
    );

    if (!prescription) {
      return res.status(404).send({ error: 'Prescription not found' });
    }

    res.json(prescription);
  } catch (error) {
    console.error('Error updating prescription:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Delete a prescription
router.delete('/prescriptions/:id', auth, async (req, res) => {
  try {
    const prescription = await Prescription.findOneAndDelete({ _id: req.params.id, doctorId: req.user.id });

    if (!prescription) {
      return res.status(404).send({ error: 'Prescription not found' });
    }

    res.json({ message: 'Prescription deleted successfully' });
  } catch (error) {
    console.error('Error deleting prescription:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Get today's appointments
router.get('/appointments', auth, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = await Appointment.find({
      doctorId,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      },
      status: "scheduled"
    })
    .populate('patientId', 'firstName lastName')
    .sort({ time: 1 });

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).send({ error: 'Server error', message: error.message });
  }
});

// Update appointment status
router.patch('/appointment/:appointmentId/:status', auth, async (req, res) => {
  try {
    const { appointmentId, status } = req.params;
    const validStatuses = ['scheduled', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const doctorId = req.user.id;

    const updatedAppointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, doctorId },
      { status },
      { new: true }
    ).populate('patientId', 'firstName lastName');

    if (!updatedAppointment) {
      return res.status(404).json({ error: 'Appointment not found or unauthorized' });
    }

    res.json({ message: 'Appointment status updated', appointment: updatedAppointment });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// Get completed or cancelled appointments
router.get('/appointment/completed', auth, async (req, res) => {
  try {
    const doctorId = req.user.id;

    const completedAppointments = await Appointment.find({
      doctorId,
      status: { $in: ['completed', 'cancelled'] }
    })
    .populate('patientId', 'firstName lastName')
    .sort({ date: -1, time: 1 });

    res.json(completedAppointments);
  } catch (error) {
    console.error('Error fetching completed appointments:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// Get upcoming appointments
router.get('/appointments/upcoming', auth, async (req, res) => {
  try {
    const doctorId = req.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const upcomingAppointments = await Appointment.find({
      doctorId,
      status: 'scheduled',
      date: { $gte: tomorrow }
    })
    .populate('patientId', 'firstName lastName')
    .sort({ date: 1, time: 1 });

    res.json(upcomingAppointments);
  } catch (error) {
    console.error('Error fetching upcoming appointments:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

export default router;
