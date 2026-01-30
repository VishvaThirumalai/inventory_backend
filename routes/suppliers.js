// routes/suppliers.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getAll,
  getById,
  create,
  update,
  delete: deleteSupplier
} = require('../controllers/supplierController');

// Validation rules
const supplierValidation = [
  body('name').notEmpty().withMessage('Supplier name is required'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number'),
  body('address').optional(),
  body('contact_person').optional(),
  body('status').optional().isIn(['active', 'inactive'])
];

// Routes
router.get('/', protect, getAll);
router.get('/:id', protect, getById);
router.post('/', protect, supplierValidation, create);
router.put('/:id', protect, supplierValidation, update);
router.delete('/:id', protect, deleteSupplier);

module.exports = router;