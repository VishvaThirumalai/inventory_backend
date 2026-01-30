// controllers/productController.js
const Product = require('../models/Product');
const { validationResult } = require('express-validator');

// Get all products with pagination
exports.getAll = async (req, res) => {
  try {
    console.log('📥 Backend received query params:', req.query);
    
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = '',
      category_id = '',
      supplier_id = ''
    } = req.query;
    
    console.log('🔍 Parsed parameters:', {
      page, limit, search, status, category_id, supplier_id
    });
    
    const result = await Product.getAll({ 
      page: parseInt(page), 
      limit: parseInt(limit), 
      search, 
      status,
      category_id,
      supplier_id
    });
    
    console.log('📤 Backend returning:', {
      success: true,
      total: result.total,
      productsCount: result.products?.length || 0
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('💥 Backend error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get product by ID
exports.getById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new product
exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Check if SKU already exists
    const existingProduct = await Product.findBySku(req.body.sku);
    if (existingProduct) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product with this SKU already exists' 
      });
    }

    const product = await Product.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update product
exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Check if SKU already exists (excluding current product)
    const existingProduct = await Product.findBySku(req.body.sku, req.params.id);
    if (existingProduct) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product with this SKU already exists' 
      });
    }

    const product = await Product.update(req.params.id, req.body);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete product
exports.delete = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await Product.delete(req.params.id);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get low stock products
exports.getLowStock = async (req, res) => {
  try {
    const products = await Product.getLowStock();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update product stock
exports.updateStock = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Quantity is required' 
      });
    }

    const product = await Product.updateStock(req.params.id, quantity);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};