const express = require('express');
const router = express.Router();
const { Course, User, CourseContent, Enrollment, Quiz } = require('../models');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { Op } = require('sequelize');
const { generateQuiz } = require('../services/ai');

router.get('/', async (req, res) => {
  try {
    const { category, search, level, page = 1, limit = 12 } = req.query;
    const where = { status: 'published' };
    
    if (category) where.category = category;
    if (level) where.level = level;
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    const offset = (page - 1) * limit;
    const { count, rows } = await Course.findAndCountAll({
      where,
      include: [{ model: User, as: 'instructor', attributes: ['firstName', 'lastName', 'profilePicture'] }],
      limit: parseInt(limit),
      offset
    });
    
    res.json({ courses: rows, total: count });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: [
        { model: User, as: 'instructor', attributes: ['firstName', 'lastName', 'profilePicture', 'bio'] },
        { model: CourseContent, as: 'contents' },
        { model: Quiz, as: 'quizzes' }
      ]
    });
    
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch course' });
  }
});

router.post('/', auth, requireRole('instructor'), async (req, res) => {
  try {
    const { title, description, price, category, level, thumbnail, contents } = req.body;
    if (!title || !description || !category) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const course = await Course.create({
      title, description, price: price || 0, category, level: level || 'beginner',
      thumbnail, instructorId: req.userId, status: 'pending'
    });
    
    if (contents && Array.isArray(contents)) {
      const contentData = contents.map((item, index) => ({
        courseId: course.id,
        title: item.title,
        type: item.type,
        url: item.url,
        content: item.content,
        duration: item.duration,
        order: item.order || index
      }));
      await CourseContent.bulkCreate(contentData);
    }
    
    res.status(201).json({ message: 'Course created! Awaiting approval.', course });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create course' });
  }
});

router.put('/:id', auth, requireRole('instructor'), async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (course.instructorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    
    if (course.status === 'published') req.body.status = 'pending';
    await course.update(req.body);
    
    res.json({ message: 'Course updated', course });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update course' });
  }
});

router.delete('/:id', auth, requireRole('instructor'), async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (course.instructorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    
    const enrollmentCount = await Enrollment.count({ where: { courseId: course.id } });
    if (enrollmentCount > 0) {
      return res.status(400).json({ message: 'Cannot delete course with enrollments' });
    }
    
    await course.destroy();
    res.json({ message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete course' });
  }
});

router.get('/instructor/my-courses', auth, requireRole('instructor'), async (req, res) => {
  try {
    const courses = await Course.findAll({
      where: { instructorId: req.userId },
      include: [{ model: CourseContent, as: 'contents' }],
      order: [['createdAt', 'DESC']]
    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

router.get('/student/enrolled', auth, requireRole('student'), async (req, res) => {
  try {
    const enrollments = await Enrollment.findAll({
      where: { studentId: req.userId },
      include: [{
        model: Course,
        as: 'course',
        include: [{ model: User, as: 'instructor', attributes: ['firstName', 'lastName'] }]
      }],
      order: [['lastAccessedAt', 'DESC']]
    });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

router.put('/:id/progress', auth, requireRole('student'), async (req, res) => {
  try {
    const { progress } = req.body;
    const enrollment = await Enrollment.findOne({
      where: { courseId: req.params.id, studentId: req.userId }
    });
    
    if (!enrollment) return res.status(404).json({ message: 'Not enrolled' });
    
    enrollment.progress = progress;
    enrollment.lastAccessedAt = new Date();
    if (progress >= 100) enrollment.completedAt = new Date();
    await enrollment.save();
    
    res.json({ message: 'Progress updated', enrollment });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update progress' });
  }
});

router.post('/:id/generate-quiz', auth, async (req, res) => {
  try {
    const { difficulty = 'medium', numQuestions = 10 } = req.body;
    const course = await Course.findByPk(req.params.id, {
      include: [{ model: CourseContent, as: 'contents' }]
    });
    
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    const questions = await generateQuiz(course, difficulty, numQuestions);
    const quiz = await Quiz.create({
      courseId: course.id,
      title: `${course.title} - ${difficulty} Quiz`,
      questions,
      passingScore: 70
    });
    
    res.json({ message: 'Quiz generated', quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate quiz' });
  }
});

module.exports = router;