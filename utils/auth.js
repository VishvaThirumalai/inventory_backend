const jwt = require('jsonwebtoken');
require('dotenv').config();

// Generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Create response with token
const createAuthResponse = (user) => {
  const token = generateToken(user.id, user.role);
  
  return {
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    }
  };
};

module.exports = {
  generateToken,
  verifyToken,
  createAuthResponse
};