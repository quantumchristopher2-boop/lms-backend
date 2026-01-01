const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

// USER MODEL
const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('student', 'instructor', 'admin'), defaultValue: 'student' },
  status: { type: DataTypes.ENUM('pending', 'active', 'suspended'), defaultValue: 'active' },
  firstName: DataTypes.STRING,
  lastName: DataTypes.STRING,
  profilePicture: DataTypes.STRING,
  bio: DataTypes.TEXT,
  paypalEmail: DataTypes.STRING,
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  resetPasswordToken: DataTypes.STRING,
  resetPasswordExpires: DataTypes.DATE
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) user.password = await bcrypt.hash(user.password, 10);
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) user.password = await bcrypt.hash(user.password, 10);
    }
  }
});

User.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

// COURSE MODEL
const Course = sequelize.define('Course', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  thumbnail: DataTypes.STRING,
  category: { type: DataTypes.STRING, allowNull: false },
  level: { type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'), defaultValue: 'beginner' },
  status: { type: DataTypes.ENUM('draft', 'pending', 'published', 'rejected'), defaultValue: 'draft' },
  rating: { type: DataTypes.DECIMAL(2, 1), defaultValue: 0 },
  enrollmentCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  duration: DataTypes.INTEGER,
  language: { type: DataTypes.STRING, defaultValue: 'English' },
  instructorId: { type: DataTypes.UUID, allowNull: false }
});

// COURSE CONTENT MODEL
const CourseContent = sequelize.define('CourseContent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  courseId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('video', 'pdf', 'text', 'quiz'), allowNull: false },
  url: DataTypes.STRING,
  content: DataTypes.TEXT,
  duration: DataTypes.INTEGER,
  order: { type: DataTypes.INTEGER, defaultValue: 0 }
});

// ENROLLMENT MODEL
const Enrollment = sequelize.define('Enrollment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  studentId: { type: DataTypes.UUID, allowNull: false },
  courseId: { type: DataTypes.UUID, allowNull: false },
  progress: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  completedAt: DataTypes.DATE,
  lastAccessedAt: DataTypes.DATE
});

// PAYMENT MODEL
const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  studentId: { type: DataTypes.UUID, allowNull: false },
  courseId: { type: DataTypes.UUID, allowNull: false },
  instructorId: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING, defaultValue: 'USD' },
  paymentMethod: { type: DataTypes.ENUM('stripe', 'paypal'), allowNull: false },
  transactionId: DataTypes.STRING,
  status: { type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'), defaultValue: 'pending' },
  platformFee: DataTypes.DECIMAL(10, 2),
  instructorPayout: DataTypes.DECIMAL(10, 2)
});

// QUIZ MODEL
const Quiz = sequelize.define('Quiz', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  courseId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  questions: { type: DataTypes.JSONB, allowNull: false },
  passingScore: { type: DataTypes.INTEGER, defaultValue: 70 }
});

// ASSOCIATIONS
User.hasMany(Course, { foreignKey: 'instructorId', as: 'courses' });
Course.belongsTo(User, { foreignKey: 'instructorId', as: 'instructor' });
Course.hasMany(CourseContent, { foreignKey: 'courseId', as: 'contents' });
CourseContent.belongsTo(Course, { foreignKey: 'courseId' });
User.hasMany(Enrollment, { foreignKey: 'studentId', as: 'enrollments' });
Enrollment.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments' });
Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Course.hasMany(Quiz, { foreignKey: 'courseId', as: 'quizzes' });
Quiz.belongsTo(Course, { foreignKey: 'courseId' });
Payment.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
Payment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Payment.belongsTo(User, { foreignKey: 'instructorId', as: 'instructor' });

module.exports = { User, Course, CourseContent, Enrollment, Payment, Quiz };