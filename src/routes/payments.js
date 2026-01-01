const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Course, Payment, Enrollment, User } = require('../models');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

router.post('/create-checkout', auth, requireRole('student'), async (req, res) => {
  try {
    const { courseId } = req.body;
    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    const existing = await Enrollment.findOne({
      where: { studentId: req.userId, courseId }
    });
    if (existing) return res.status(400).json({ message: 'Already enrolled' });
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: course.title,
            description: course.description.substring(0, 200),
            images: course.thumbnail ? [course.thumbnail] : []
          },
          unit_amount: Math.round(course.price * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/courses/${courseId}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/courses/${courseId}`,
      metadata: {
        courseId: course.id,
        studentId: req.userId,
        instructorId: course.instructorId
      }
    });
    
    res.json({ sessionUrl: session.url });
  } catch (error) {
    res.status(500).json({ message: 'Checkout failed' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { courseId, studentId, instructorId } = session.metadata;
    
    try {
      const course = await Course.findByPk(courseId);
      const platformFee = course.price * 0.15;
      const instructorPayout = course.price - platformFee;
      
      await Payment.create({
        studentId,
        courseId,
        instructorId,
        amount: course.price,
        currency: 'USD',
        paymentMethod: 'stripe',
        transactionId: session.payment_intent,
        status: 'completed',
        platformFee,
        instructorPayout
      });
      
      await Enrollment.create({
        studentId,
        courseId,
        progress: 0
      });
      
      course.enrollmentCount += 1;
      await course.save();
      
      console.log(`Payment processed: ${session.payment_intent}`);
    } catch (error) {
      console.error('Webhook processing error:', error);
    }
  }
  
  res.json({ received: true });
});

router.get('/history', auth, requireRole('student'), async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: { studentId: req.userId },
      include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'thumbnail'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch payment history' });
  }
});

router.get('/earnings', auth, requireRole('instructor'), async (req, res) => {
  try {
    const { sequelize } = require('../config/database');
    
    const earnings = await Payment.findAll({
      where: { 
        instructorId: req.userId,
        status: 'completed'
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('instructorPayout')), 'totalEarnings'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales']
      ],
      raw: true
    });
    
    const recentSales = await Payment.findAll({
      where: { instructorId: req.userId },
      include: [
        { model: Course, as: 'course', attributes: ['title'] },
        { model: User, as: 'student', attributes: ['firstName', 'lastName', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    
    res.json({
      totalEarnings: earnings[0]?.totalEarnings || 0,
      totalSales: earnings[0]?.totalSales || 0,
      recentSales
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch earnings' });
  }
});

module.exports = router;