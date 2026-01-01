const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const { sendEmail } = require('../services/email');
const auth = require('../middleware/auth');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId, role }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

router.post('/register', async (req, res) => {
  try {
    const { email, password, role, firstName, lastName } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already exists' });
    
    const user = await User.create({
      email, password, role: role || 'student', firstName, lastName,
      status: role === 'instructor' ? 'pending' : 'active'
    });
    
    const tokens = generateTokens(user.id, user.role);
    res.status(201).json({
      message: 'Registration successful',
      user: { id: user.id, email: user.email, role: user.role },
      ...tokens
    });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.status === 'suspended') return res.status(403).json({ message: 'Account suspended' });
    
    const tokens = generateTokens(user.id, user.role);
    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName },
      ...tokens
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.json({ message: 'If email exists, reset link sent' });
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();
    
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Password Reset',
      html: `<h2>Reset Your Password</h2><a href="${resetUrl}">Click here to reset</a><p>Expires in 1 hour.</p>`
    });
    
    res.json({ message: 'Reset link sent' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send reset email' });
  }
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const { Op } = require('sequelize');
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    
    const user = await User.findOne({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { [Op.gt]: new Date() }
      }
    });
    
    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
    
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Password reset failed' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: { exclude: ['password', 'resetPasswordToken'] }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

module.exports = router;