const Supplier = require('../models/Supplier');
const { validationResult } = require('express-validator');

// Get all suppliers
exports.getAll = async (req, res) => {
  try {
    console.log('🔍 [Suppliers] Getting all suppliers...');
    console.log('📝 Request headers:', req.headers);
    
    const suppliers = await Supplier.getAll();
    
    console.log(`✅ [Suppliers] Found ${suppliers.length} suppliers`);
    console.log('📦 Sample supplier:', suppliers.length > 0 ? suppliers[0] : 'No suppliers');
    
    res.json({ 
      success: true, 
      data: suppliers,
      count: suppliers.length 
    });
  } catch (error) {
    console.error('❌ [Suppliers] Error in getAll:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch suppliers: ' + error.message,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Keep other methods the same for now...

// Get supplier by ID
exports.getById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new supplier
exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const supplier = await Supplier.create(req.body);
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update supplier
exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const supplier = await Supplier.update(req.params.id, req.body);
    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// Delete supplier
exports.delete = async (req, res) => {
  try {
    await Supplier.delete(req.params.id);
    res.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};