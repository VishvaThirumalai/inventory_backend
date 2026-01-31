// controllers/categoryController.js
const Category = require('../models/Category');
const { validationResult } = require('express-validator');

// Get all categories with product counts
exports.getAll = async (req, res) => {
  try {
    console.log('🔍 [Categories] Getting all categories with counts...');
    
    const { page = 1, limit = 100, search = '' } = req.query;
    
    const result = await Category.getAll({ 
      page: parseInt(page), 
      limit: parseInt(limit), 
      search 
    });
    
    console.log(`✅ [Categories] Found ${result.categories.length} categories`);
    
    res.json({ 
      success: true, 
      data: result.categories,
      count: result.categories.length,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('❌ [Categories] Error in getAll:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch categories: ' + error.message,
      error: error.message
    });
  }
};

// Get category by ID with detailed info
exports.getById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Get product count
    const productCount = await Category.getProductCount(category.id);
    category.product_count = productCount;
    
    // Get suppliers for this category
    const suppliers = await Category.getCategorySuppliers(category.id);
    category.suppliers = suppliers;
    
    res.json({ success: true, data: category });
  } catch (error) {
    console.error('❌ [Categories] Error in getById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new category
exports.create = async (req, res) => {
  try {
    console.log('📥 [Category Controller] CREATE - Received request body:', {
      body: req.body,
      name: req.body.name,
      nameRaw: req.body.name,
      nameIncludesAmpersand: req.body.name?.includes('&'),
      nameIncludesAmpEntity: req.body.name?.includes('&amp;'),
      headers: req.headers,
      contentType: req.headers['content-type']
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const category = await Category.create(req.body);
    
    console.log('📤 [Category Controller] CREATE - Returning category:', {
      id: category.id,
      name: category.name,
      nameFromResponse: category.name,
      nameIncludesAmpersand: category.name?.includes('&'),
      nameIncludesAmpEntity: category.name?.includes('&amp;')
    });
    
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    console.error('❌ [Categories] Error in create:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update category
exports.update = async (req, res) => {
  try {
    console.log('📥 [Category Controller] UPDATE - Received request body:', {
      body: req.body,
      name: req.body.name,
      nameRaw: req.body.name,
      nameIncludesAmpersand: req.body.name?.includes('&'),
      nameIncludesAmpEntity: req.body.name?.includes('&amp;'),
      id: req.params.id
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const category = await Category.update(req.params.id, req.body);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    console.log('📤 [Category Controller] UPDATE - Returning category:', {
      id: category.id,
      name: category.name,
      nameFromResponse: category.name,
      nameIncludesAmpersand: category.name?.includes('&'),
      nameIncludesAmpEntity: category.name?.includes('&amp;')
    });
    
    res.json({ success: true, data: category });
  } catch (error) {
    console.error('❌ [Categories] Error in update:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete category
exports.delete = async (req, res) => {
  try {
    // Check if category has products
    const productCount = await Category.getProductCount(req.params.id);
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete category with existing products. Move or delete products first.' 
      });
    }
    
    const deleted = await Category.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('❌ [Categories] Error in delete:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get category statistics - NEEDS UPDATE FOR POSTGRESQL
exports.getStats = async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT c.id) as total_categories,
        COUNT(DISTINCT p.id) as total_products,
        SUM(p.current_stock * p.cost_price) as total_inventory_value,
        SUM(CASE WHEN p.current_stock <= p.min_stock_level THEN 1 ELSE 0 END) as low_stock_products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE p.status != 'discontinued' OR p.status IS NULL
    `);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ [Categories] Error in getStats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
