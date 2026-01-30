const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  getAllSales,
  getSaleById,
  createSale,
  getSalesStats,
  cancelSale,
  refundSale,
  getTodaySales,
  completeSale  // Add this
} = require('../controllers/saleController');

// Update validation rules:
const createSaleValidation = [
  body('customer_name').optional().trim().isString().withMessage('Customer name must be a string'),
  body('customer_phone').optional().trim().isMobilePhone().withMessage('Valid phone number required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unit_price').optional().isFloat({ min: 0 }).withMessage('Unit price must be positive'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Discount must be positive'),
  body('tax_amount').optional().isFloat({ min: 0 }).withMessage('Tax must be positive'),
  body('amount_paid').isFloat({ min: 0 }).withMessage('Amount paid must be positive'),
  body('payment_method').optional().isIn(['cash', 'card', 'online', 'credit']).withMessage('Invalid payment method'),
  body('notes').optional().trim().isString().withMessage('Notes must be a string')
];

// Add validation for complete sale
const completeSaleValidation = [
  body('amount_paid').isFloat({ min: 0 }).withMessage('Amount paid must be positive'),
  body('payment_method').optional().isIn(['cash', 'card', 'online', 'credit']).withMessage('Invalid payment method')
];

// Routes
router.get('/', protect, getAllSales);
router.get('/stats', protect, getSalesStats);
router.get('/today', protect, getTodaySales);
router.get('/:id', protect, getSaleById);
router.post('/', protect, createSaleValidation, createSale);
router.put('/:id/cancel', protect, cancelSale);
router.put('/:id/refund', protect, refundSale);
router.put('/:id/complete', protect, completeSaleValidation, completeSale);  // Add this route

module.exports = router;