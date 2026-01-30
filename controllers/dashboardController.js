// controllers/dashboardController.js
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { pool } = require('../config/database');

// Get dashboard statistics - UPDATE FOR POSTGRESQL
exports.getStats = async (req, res) => {
  try {
    // Get total products
    const productResult = await pool.query('SELECT COUNT(*) as total FROM products WHERE status != \'discontinued\'');
    const totalProducts = parseInt(productResult.rows[0].total);

    // Get today's sales
    const today = new Date().toISOString().split('T')[0];
    const salesResult = await pool.query(
      'SELECT SUM(final_amount) as total FROM sales WHERE DATE(created_at) = $1 AND status = \'completed\'',
      [today]
    );
    const todaySales = parseFloat(salesResult.rows[0].total) || 0;

    // Get low stock items
    const lowStockItems = await Product.getLowStock();

    // Get monthly revenue
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthlyResult = await pool.query(
      'SELECT SUM(final_amount) as total FROM sales WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND status = \'completed\'',
      [currentMonth, currentYear]
    );
    const monthlyRevenue = parseFloat(monthlyResult.rows[0].total) || 0;

    // Get recent sales
    const recentSales = await pool.query(
      'SELECT invoice_number, customer_name, final_amount, created_at FROM sales ORDER BY created_at DESC LIMIT 5'
    );

    // Get top selling products
    const topProducts = await pool.query(`
      SELECT p.name, SUM(si.quantity) as total_sold 
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY p.id 
      ORDER BY total_sold DESC 
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalProducts,
        todaySales,
        lowStockItems: lowStockItems.length,
        monthlyRevenue,
        recentSales: recentSales.rows,
        topProducts: topProducts.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};