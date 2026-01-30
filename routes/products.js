const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getAll,
  getById,
  create,
  update,
  delete: deleteProduct,
  getLowStock,
  updateStock
} = require('../controllers/productController');

// Validation rules
const productValidation = [
  body('name').notEmpty().trim().withMessage('Product name is required'),
  body('sku').notEmpty().trim().withMessage('SKU is required'),
  body('description').optional().trim(),
  body('category_id').optional().isInt().withMessage('Category ID must be an integer'),
  body('supplier_id').optional().isInt().withMessage('Supplier ID must be an integer'),
  body('cost_price').isFloat({ min: 0 }).withMessage('Valid cost price required'),
  body('selling_price').isFloat({ min: 0 }).withMessage('Valid selling price required'),
  body('current_stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('min_stock_level').optional().isInt({ min: 0 }).withMessage('Min stock level must be a non-negative integer'),
  body('max_stock_level').optional().isInt({ min: 1 }).withMessage('Max stock level must be at least 1'),
  body('unit').optional().trim(),
  body('status').optional().isIn(['active', 'discontinued', 'out_of_stock']).withMessage('Invalid status')
];

const stockValidation = [
  body('quantity').isInt().withMessage('Quantity must be an integer')
];

// Routes
router.get('/', protect, getAll);
router.get('/low-stock', protect, getLowStock);
router.get('/:id', protect, getById);
router.post('/', protect, productValidation, create);
router.put('/:id', protect, productValidation, update);
router.put('/:id/stock', protect, stockValidation, updateStock);
router.delete('/:id', protect, deleteProduct);

module.exports = router;