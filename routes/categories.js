const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getAll,
  getById,
  create,
  update,
  delete: deleteCategory,
  getStats
} = require('../controllers/categoryController');

// Validation rules
const categoryValidation = [
  body('name').notEmpty().withMessage('Category name is required').trim().escape(),
  body('description').optional().trim().escape()
];

// Routes
router.get('/', protect, getAll);
router.get('/stats', protect, getStats);
router.get('/:id', protect, getById);
router.post('/', protect, categoryValidation, create);
router.put('/:id', protect, categoryValidation, update);
router.delete('/:id', protect, deleteCategory);

module.exports = router;