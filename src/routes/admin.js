const express = require('express');
const router = express.Router();
const { User, Course, Payment, Enrollment } = require('../models');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { sendEmail } = require('../services/email');

router.use(auth, requireRole('admin'));

router.get('/analytics', async (req, res) => {
  try {
    const [totalStudents, totalInstructors, totalCourses, pendingCourses, totalRevenue] = await Promise.all([
      User.count({ where: { role: 'student' } }),
      User.count({ where: { role: 'instructor', status: 'active' } }),
      Course.count({ where: { status: 'published' } }),
      Course.count({ where: { status: 'pending' } }),
      Payment.sum('amount', { where: { status: 'completed' } }) || 0
    ]);
    
    const topCourses = await Course.findAll({
      attributes: ['id', 'title', 'price', 'enrollmentCount'],
      order: [['enrollmentCount', 'DESC']],
      limit: 5
    });
    
    res.json({ totalStudents, totalInstructors, totalCourses, pendingCourses, totalRevenue, topCourses });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { role, status, search } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    const users = await User.findAll({
      where,
      attributes: { exclude: ['password', 'resetPasswordToken'] },
      order: [['createdAt', 'DESC']]
    });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

router.patch('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.status = status;
    await user.save();
    
    if (status === 'active' && user.role === 'instructor') {
      await sendEmail({
        to: user.email,
        subject: 'Instructor Account Approved',
        html: '<h2>Congratulations! Your instructor account has been approved.</h2>'
      });
    }
    
    res.json({ message: `User status updated to ${status}`, user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Cannot delete admin' });
    
    await user.destroy();
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const { status, instructorId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (instructorId) where.instructorId = instructorId;
    
    const courses = await Course.findAll({
      where,
      include: [{ model: User, as: 'instructor', attributes: ['id', 'email', 'firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']]
    });
    
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

router.patch('/courses/:id/status', async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const course = await Course.findByPk(req.params.id, {
      include: [{ model: User, as: 'instructor' }]
    });
    
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    course.status = status;
    await course.save();
    
    if (status === 'published') {
      await sendEmail({
        to: course.instructor.email,
        subject: 'Course Approved',
        html: `<h2>Your course "${course.title}" is now live!</h2>`
      });
    } else if (status === 'rejected') {
      await sendEmail({
        to: course.instructor.email,
        subject: 'Course Needs Updates',
        html: `<h2>Course Update Needed</h2><p>${rejectionReason || 'Please review and resubmit.'}</p>`
      });
    }
    
    res.json({ message: `Course ${status}`, course });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update course' });
  }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    await course.update(req.body);
    res.json({ message: 'Course updated', course });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update course' });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    await course.destroy();
    res.json({ message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete course' });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [
        { model: User, as: 'student', attributes: ['email', 'firstName', 'lastName'] },
        { model: Course, as: 'course', attributes: ['title'] },
        { model: User, as: 'instructor', attributes: ['email', 'firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch payments' });
  }
});

module.exports = router;