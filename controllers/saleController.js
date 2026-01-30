const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { validationResult } = require('express-validator');

// @desc    Get all sales with filters
// @route   GET /api/sales
exports.getAllSales = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate,
      status = 'all',
      payment_method = 'all'
    } = req.query;
    
    const salesData = await Sale.getAll({
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      status,
      payment_method
    });
    
    res.json({
      success: true,
      ...salesData
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get single sale by ID
// @route   GET /api/sales/:id
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }
    
    res.json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Get sale by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sale',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Create new sale
// @route   POST /api/sales
exports.createSale = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { 
      customer_name, 
      customer_email, 
      customer_phone, 
      items,
      discount_amount = 0,
      tax_amount = 0,
      amount_paid = 0,
      payment_method = 'cash',
      notes,
      calculate_tax = true,
      tax_rate = 8 // Default 8%
    } = req.body;

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale must contain at least one item'
      });
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    const sale_items = [];
    
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${item.product_id} not found`
        });
      }

      if (product.current_stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}. Available: ${product.current_stock}`
        });
      }

      const unit_price = parseFloat(item.unit_price || product.selling_price);
      const total_price = unit_price * parseInt(item.quantity);
      
      subtotal += total_price;
      
      sale_items.push({
        product_id: item.product_id,
        quantity: parseInt(item.quantity),
        unit_price: unit_price,
        total_price: total_price
      });
    }

    // Calculate tax if enabled
    let calculated_tax = 0;
    if (calculate_tax) {
      calculated_tax = subtotal * (parseFloat(tax_rate) / 100);
    }

    // Apply discount and tax
    const discount = parseFloat(discount_amount) || 0;
    const final_tax = parseFloat(tax_amount) || calculated_tax;
    const final_amount = subtotal - discount + final_tax;
    const amountPaid = parseFloat(amount_paid) || 0;
    const change_amount = Math.max(amountPaid - final_amount, 0);

    // Determine payment status and sale status
    let payment_status = 'paid';
    let sale_status = 'completed';
    
    if (amountPaid === 0) {
      payment_status = 'pending';
      sale_status = 'pending';
    } else if (amountPaid > 0 && amountPaid < final_amount) {
      payment_status = 'partial';
      sale_status = 'pending';
    }

    const saleData = {
      customer_name: customer_name || null,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      total_amount: subtotal,
      discount_amount: discount,
      tax_amount: final_tax,
      final_amount: final_amount,
      amount_paid: amountPaid,
      change_amount: change_amount,
      payment_method: payment_method,
      payment_status: payment_status,
      status: sale_status,
      sold_by: req.user.id,
      notes: notes || null
    };

    // Create sale
    const sale = await Sale.create(saleData, sale_items);
    
    res.status(201).json({
      success: true,
      message: sale_status === 'completed' ? 'Sale created successfully' : 'Pending sale created successfully',
      data: sale
    });
    
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sale',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Complete pending sale
// @route   PUT /api/sales/:id/complete
exports.completeSale = async (req, res) => {
  try {
    const { amount_paid, payment_method } = req.body;
    
    if (!amount_paid || amount_paid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount paid must be greater than 0'
      });
    }

    // Get the sale
    const sale = await Sale.findById(req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    if (sale.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending sales can be completed'
      });
    }

    // Calculate new totals
    const newAmountPaid = parseFloat(sale.amount_paid) + parseFloat(amount_paid);
    const remainingBalance = sale.final_amount - newAmountPaid;
    
    if (remainingBalance < 0) {
      // Overpayment - calculate change
      const change_amount = Math.abs(remainingBalance);
      
      const updatedSale = await Sale.updateStatus(req.params.id, {
        status: 'completed',
        payment_status: 'paid',
        amount_paid: newAmountPaid,
        change_amount: change_amount,
        payment_method: payment_method || sale.payment_method
      }, req.user.id);
      
      return res.json({
        success: true,
        message: 'Sale completed successfully. Change given.',
        data: updatedSale
      });
    } else if (remainingBalance === 0) {
      // Exact payment
      const updatedSale = await Sale.updateStatus(req.params.id, {
        status: 'completed',
        payment_status: 'paid',
        amount_paid: newAmountPaid,
        change_amount: 0,
        payment_method: payment_method || sale.payment_method
      }, req.user.id);
      
      return res.json({
        success: true,
        message: 'Sale completed successfully',
        data: updatedSale
      });
    } else {
      // Partial payment
      const updatedSale = await Sale.updateStatus(req.params.id, {
        status: 'pending',
        payment_status: 'partial',
        amount_paid: newAmountPaid,
        change_amount: 0,
        payment_method: payment_method || sale.payment_method
      }, req.user.id);
      
      return res.json({
        success: true,
        message: 'Partial payment received. Sale remains pending.',
        data: updatedSale
      });
    }
    
  } catch (error) {
    console.error('Complete sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete sale',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get sales statistics
// @route   GET /api/sales/stats
exports.getSalesStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
    // Get sales stats
    const summary = await Sale.getSalesStats(period);
    
    // Get daily sales for chart
    const dailySales = await Sale.getDailySales(7);
    
    // Get top products
    const topProducts = await Sale.getTopProducts(5);
    
    res.json({
      success: true,
      data: {
        period,
        summary,
        daily_sales: dailySales,
        top_products: topProducts
      }
    });
    
  } catch (error) {
    console.error('Get sales stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales statistics'
    });
  }
};

// @desc    Cancel sale
// @route   PUT /api/sales/:id/cancel
exports.cancelSale = async (req, res) => {
  try {
    const result = await Sale.cancel(req.params.id, req.user.id);
    
    if (!result) {
      return res.status(400).json({
        success: false,
        message: 'Failed to cancel sale'
      });
    }
    
    res.json({
      success: true,
      message: 'Sale cancelled successfully. Stock has been restored.'
    });
    
  } catch (error) {
    console.error('Cancel sale error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel sale',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Refund sale
// @route   PUT /api/sales/:id/refund
exports.refundSale = async (req, res) => {
  try {
    const { notes } = req.body;
    
    const result = await Sale.refund(req.params.id, req.user.id, notes);
    
    if (!result) {
      return res.status(400).json({
        success: false,
        message: 'Failed to refund sale'
      });
    }
    
    res.json({
      success: true,
      message: 'Sale refunded successfully. Stock has been restored.'
    });
    
  } catch (error) {
    console.error('Refund sale error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to refund sale',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get today's sales summary
// @route   GET /api/sales/today
exports.getTodaySales = async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    const [todayStats] = await pool.query(`
      SELECT 
        COALESCE(COUNT(*), 0) as count,
        COALESCE(SUM(final_amount), 0) as revenue,
        COALESCE(AVG(final_amount), 0) as average_sale
      FROM sales 
      WHERE DATE(created_at) = CURDATE() 
      AND status = 'completed'
    `);
    
    const [pendingSales] = await pool.query(`
      SELECT COUNT(*) as count
      FROM sales 
      WHERE DATE(created_at) = CURDATE() 
      AND status = 'pending'
    `);
    
    const [recentSales] = await pool.query(`
      SELECT s.*, u.name as sold_by_name
      FROM sales s
      LEFT JOIN users u ON s.sold_by = u.id
      WHERE DATE(s.created_at) = CURDATE()
      ORDER BY s.created_at DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      data: {
        summary: todayStats[0],
        pending: pendingSales[0],
        recent: recentSales
      }
    });
    
  } catch (error) {
    console.error('Get today sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s sales'
    });
  }
};