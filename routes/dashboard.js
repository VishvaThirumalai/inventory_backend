const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { protect } = require('../middleware/auth');

// Helper function to calculate percentage change
const calculateChange = (current, previous) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Get REAL Dashboard Statistics with proper calculations
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Fetching dashboard stats for user: ${userId}`);
    
    // Get dates for calculations
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
    
    let stats = {
      totalProducts: 0,
      totalSales: 0,
      totalRevenue: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      todaySales: 0,
      todayRevenue: 0,
      todaySalesChange: 0,
      todayRevenueChange: 0,
      monthlyRevenue: 0,
      monthlyRevenueChange: 0,
      activeSuppliers: 0,
      inventoryValue: 0,
      averageOrderValue: 0,
      inventoryTurnover: 0,
      topSellingProduct: '',
      topProductQuantity: 0,
      bestCustomer: '',
      bestCustomerSpent: 0,
      inventoryWorth: 0,
      inventoryProfitPotential: 0
    };
    
    try {
      // 1. Total Products
      const [productsRows] = await pool.query('SELECT COUNT(*) as total FROM products WHERE status != "discontinued"');
      stats.totalProducts = productsRows[0]?.total || 0;
      
      // 2. Total Sales (completed)
      const [salesRows] = await pool.query("SELECT COUNT(*) as total FROM sales WHERE status = 'completed'");
      stats.totalSales = salesRows[0]?.total || 0;
      
      // 3. Total Revenue
      const [revenueRows] = await pool.query("SELECT COALESCE(SUM(final_amount), 0) as revenue FROM sales WHERE status = 'completed'");
      stats.totalRevenue = parseFloat(revenueRows[0]?.revenue) || 0;
      
      // 4. Today's Sales
      const [todayRows] = await pool.query(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(final_amount), 0) as revenue
        FROM sales 
        WHERE DATE(created_at) = ? 
          AND status = 'completed'
      `, [todayStr]);
      stats.todaySales = todayRows[0]?.count || 0;
      stats.todayRevenue = parseFloat(todayRows[0]?.revenue) || 0;
      
      // 5. Yesterday's sales for comparison
      const [yesterdayRows] = await pool.query(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(final_amount), 0) as revenue
        FROM sales 
        WHERE DATE(created_at) = ? 
          AND status = 'completed'
      `, [yesterdayStr]);
      
      const yesterdaySales = yesterdayRows[0]?.count || 0;
      const yesterdayRevenue = parseFloat(yesterdayRows[0]?.revenue) || 0;
      
      // Calculate changes
      stats.todaySalesChange = calculateChange(stats.todaySales, yesterdaySales);
      stats.todayRevenueChange = calculateChange(stats.todayRevenue, yesterdayRevenue);
      
      // 6. Monthly Revenue (current month)
      const [monthRows] = await pool.query(`
        SELECT COALESCE(SUM(final_amount), 0) as revenue
        FROM sales 
        WHERE DATE(created_at) >= ? 
          AND status = 'completed'
      `, [monthStart]);
      stats.monthlyRevenue = parseFloat(monthRows[0]?.revenue) || 0;
      
      // 7. Last month revenue for comparison
      const [lastMonthRows] = await pool.query(`
        SELECT COALESCE(SUM(final_amount), 0) as revenue
        FROM sales 
        WHERE DATE(created_at) BETWEEN ? AND ?
          AND status = 'completed'
      `, [lastMonthStart, lastMonthEnd]);
      
      const lastMonthRevenue = parseFloat(lastMonthRows[0]?.revenue) || 0;
      stats.monthlyRevenueChange = calculateChange(stats.monthlyRevenue, lastMonthRevenue);
      
      // 8. Low Stock Items (stock <= min_stock_level but > 0)
      const [lowStockRows] = await pool.query(`
        SELECT COUNT(*) as count
        FROM products 
        WHERE current_stock <= min_stock_level 
          AND current_stock > 0
          AND status != 'discontinued'
      `);
      stats.lowStockItems = lowStockRows[0]?.count || 0;
      
      // 9. Out of Stock Items
      const [outStockRows] = await pool.query(`
        SELECT COUNT(*) as count
        FROM products 
        WHERE current_stock = 0
          AND status != 'discontinued'
      `);
      stats.outOfStockItems = outStockRows[0]?.count || 0;
      
      // 10. Active Suppliers
      const [suppliersRows] = await pool.query("SELECT COUNT(*) as total FROM suppliers WHERE status = 'active'");
      stats.activeSuppliers = suppliersRows[0]?.total || 0;
      
      // 11. Inventory Value (at cost price)
      const [inventoryCostRows] = await pool.query(`
        SELECT COALESCE(SUM(current_stock * cost_price), 0) as cost_value
        FROM products
        WHERE status != 'discontinued'
      `);
      stats.inventoryValue = parseFloat(inventoryCostRows[0]?.cost_value) || 0;
      
      // 12. Inventory Worth (at selling price - for display)
      const [inventoryWorthRows] = await pool.query(`
        SELECT COALESCE(SUM(current_stock * selling_price), 0) as selling_value
        FROM products
        WHERE status != 'discontinued'
      `);
      stats.inventoryWorth = parseFloat(inventoryWorthRows[0]?.selling_value) || 0;
      
      // 13. Profit Potential
      stats.inventoryProfitPotential = stats.inventoryWorth - stats.inventoryValue;
      
      // 14. Average Order Value
      stats.averageOrderValue = stats.totalSales > 0 ? stats.totalRevenue / stats.totalSales : 0;
      
      // 15. Inventory Turnover (Annualized - simplified)
      // Cost of Goods Sold / Average Inventory Value
      const [cogsRows] = await pool.query(`
        SELECT COALESCE(SUM(si.quantity * p.cost_price), 0) as cogs
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
        WHERE s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);
      const cogs = parseFloat(cogsRows[0]?.cogs) || 0;
      const avgInventory = stats.inventoryValue; // Simplified: using current inventory
      stats.inventoryTurnover = avgInventory > 0 ? (cogs / avgInventory).toFixed(2) : 0;
      
      // 16. Top Selling Product
      const [topProductRows] = await pool.query(`
        SELECT 
          p.name,
          SUM(si.quantity) as total_quantity
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
        WHERE p.status != 'discontinued'
        GROUP BY p.id
        ORDER BY total_quantity DESC
        LIMIT 1
      `);
      
      if (topProductRows.length > 0) {
        stats.topSellingProduct = topProductRows[0].name;
        stats.topProductQuantity = topProductRows[0].total_quantity || 0;
      }
      
      // 17. Best Customer
      const [customerRows] = await pool.query(`
        SELECT 
          customer_name,
          SUM(final_amount) as total_spent
        FROM sales 
        WHERE status = 'completed'
          AND customer_name IS NOT NULL
          AND customer_name != ''
        GROUP BY customer_name
        ORDER BY total_spent DESC
        LIMIT 1
      `);
      
      if (customerRows.length > 0) {
        stats.bestCustomer = customerRows[0].customer_name;
        stats.bestCustomerSpent = parseFloat(customerRows[0].total_spent) || 0;
      }
      
    } catch (dbError) {
      console.error('Database query error:', dbError.message);
    }
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Dashboard stats route error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
});

// Get Inventory Summary with real calculations
router.get('/inventory-summary', protect, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN current_stock = 0 AND status != 'discontinued' THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN current_stock > 0 AND current_stock <= min_stock_level AND status != 'discontinued' THEN 1 END) as low_stock,
        COUNT(CASE WHEN current_stock > min_stock_level AND status != 'discontinued' THEN 1 END) as in_stock,
        COUNT(CASE WHEN status = 'discontinued' THEN 1 END) as discontinued,
        COALESCE(SUM(current_stock * cost_price), 0) as total_inventory_cost,
        COALESCE(SUM(current_stock * selling_price), 0) as total_inventory_value,
        COALESCE(SUM((current_stock * selling_price) - (current_stock * cost_price)), 0) as potential_profit,
        COALESCE(AVG(CASE WHEN status != 'discontinued' THEN (current_stock / (max_stock_level + 0.001)) * 100 END), 0) as stock_health_percentage
      FROM products
    `);
    
    const summary = rows[0];
    
    res.json({
      success: true,
      data: {
        stock_status: {
          out_of_stock: summary.out_of_stock || 0,
          low_stock: summary.low_stock || 0,
          in_stock: summary.in_stock || 0,
          discontinued: summary.discontinued || 0,
          total: (summary.out_of_stock || 0) + (summary.low_stock || 0) + (summary.in_stock || 0) + (summary.discontinued || 0)
        },
        financial: {
          total_inventory_cost: parseFloat(summary.total_inventory_cost) || 0,
          total_inventory_value: parseFloat(summary.total_inventory_value) || 0,
          potential_profit: parseFloat(summary.potential_profit) || 0
        },
        health: {
          percentage: parseFloat(summary.stock_health_percentage) || 0,
          rating: summary.stock_health_percentage >= 80 ? 'Excellent' :
                  summary.stock_health_percentage >= 60 ? 'Good' :
                  summary.stock_health_percentage >= 40 ? 'Fair' : 'Poor'
        }
      }
    });
    
  } catch (error) {
    console.error('Inventory summary error:', error);
    res.json({
      success: true,
      data: null,
      error: error.message
    });
  }
});

// Other routes remain the same as before...
// Get Sales Trend (Last 7 Days)
router.get('/sales/trend', protect, async (req, res) => {
  try {
    // Get last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        DAYNAME(created_at) as day_name,
        COUNT(*) as sales_count,
        COALESCE(SUM(final_amount), 0) as revenue
      FROM sales 
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND status = 'completed'
      GROUP BY DATE(created_at), DAYNAME(created_at)
      ORDER BY date ASC
    `, [startDateStr, endDateStr]);
    
    // Format the data
    const formattedData = rows.map(row => ({
      date: row.day_name?.substring(0, 3) || 'Day',
      sales: row.sales_count || 0,
      revenue: parseFloat(row.revenue) || 0
    }));
    
    res.json({
      success: true,
      data: formattedData
    });
    
  } catch (error) {
    console.error('Sales trend error:', error);
    res.json({
      success: true,
      data: [],
      error: error.message
    });
  }
});

// Get Top Selling Products
router.get('/products/top-selling', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.current_stock,
        p.min_stock_level,
        p.unit,
        p.selling_price,
        p.cost_price,
        COALESCE(SUM(si.quantity), 0) as total_sales,
        COALESCE(SUM(si.total_price), 0) as total_revenue,
        COALESCE(SUM(si.quantity * p.cost_price), 0) as total_cost
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
      WHERE p.status != 'discontinued'
      GROUP BY p.id
      ORDER BY total_sales DESC, total_revenue DESC
      LIMIT ?
    `, [limit]);
    
    res.json({
      success: true,
      data: rows.map(product => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        current_stock: product.current_stock,
        min_stock: product.min_stock_level,
        unit: product.unit || 'pcs',
        selling_price: parseFloat(product.selling_price) || 0,
        cost_price: parseFloat(product.cost_price) || 0,
        total_sales: product.total_sales || 0,
        total_revenue: parseFloat(product.total_revenue) || 0,
        total_cost: parseFloat(product.total_cost) || 0,
        profit: parseFloat(product.total_revenue) - parseFloat(product.total_cost) || 0
      }))
    });
    
  } catch (error) {
    console.error('Top products error:', error);
    res.json({
      success: true,
      data: [],
      error: error.message
    });
  }
});

// Get Recent Sales
router.get('/sales/recent', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const [rows] = await pool.query(`
      SELECT 
        id,
        invoice_number,
        customer_name,
        final_amount,
        payment_method,
        status,
        created_at
      FROM sales 
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    
    res.json({
      success: true,
      data: rows.map(sale => ({
        id: sale.id,
        invoice_number: sale.invoice_number,
        customer_name: sale.customer_name || 'Walk-in Customer',
        final_amount: parseFloat(sale.final_amount) || 0,
        payment_method: sale.payment_method || 'cash',
        status: sale.status || 'completed',
        created_at: sale.created_at,
        formatted_date: new Date(sale.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      }))
    });
    
  } catch (error) {
    console.error('Recent sales error:', error);
    res.json({
      success: true,
      data: [],
      error: error.message
    });
  }
});

// Get Revenue by Category
router.get('/revenue-by-category', protect, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id,
        c.name as category_name,
        COUNT(DISTINCT s.id) as transaction_count,
        COALESCE(SUM(s.final_amount), 0) as total_revenue,
        COUNT(DISTINCT p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.status != 'discontinued'
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
      GROUP BY c.id, c.name
      ORDER BY total_revenue DESC
    `);
    
    res.json({
      success: true,
      data: rows.map(category => ({
        id: category.id,
        category: category.category_name || 'Uncategorized',
        revenue: parseFloat(category.total_revenue) || 0,
        transaction_count: category.transaction_count || 0,
        product_count: category.product_count || 0
      }))
    });
    
  } catch (error) {
    console.error('Category revenue error:', error);
    res.json({
      success: true,
      data: [],
      error: error.message
    });
  }
});

// Get Supplier Performance
router.get('/supplier-performance', protect, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.contact_person,
        s.email,
        s.phone,
        s.rating,
        s.total_orders,
        s.on_time_delivery_rate,
        s.status,
        COUNT(DISTINCT p.id) as products_supplied,
        COALESCE(SUM(p.current_stock * p.cost_price), 0) as current_inventory_value
      FROM suppliers s
      LEFT JOIN products p ON s.id = p.supplier_id AND p.status != 'discontinued'
      WHERE s.status = 'active'
      GROUP BY s.id, s.name, s.contact_person, s.email, s.phone, s.rating, s.total_orders, s.on_time_delivery_rate, s.status
      ORDER BY s.rating DESC, s.on_time_delivery_rate DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      data: rows.map(supplier => ({
        id: supplier.id,
        name: supplier.name,
        contact: supplier.contact_person || supplier.name,
        email: supplier.email || '',
        phone: supplier.phone || '',
        rating: parseFloat(supplier.rating) || 5.0,
        total_orders: supplier.total_orders || 0,
        on_time_delivery: parseFloat(supplier.on_time_delivery_rate) || 100.0,
        products_supplied: supplier.products_supplied || 0,
        inventory_value: parseFloat(supplier.current_inventory_value) || 0,
        status: supplier.status || 'active'
      }))
    });
    
  } catch (error) {
    console.error('Supplier performance error:', error);
    res.json({
      success: true,
      data: [],
      error: error.message
    });
  }
});

// Get Daily Summary
router.get('/daily-summary', protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total_sales_today,
        COALESCE(SUM(final_amount), 0) as total_revenue_today,
        COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_sales,
        COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_sales,
        COUNT(CASE WHEN payment_method = 'online' THEN 1 END) as online_sales,
        AVG(final_amount) as avg_order_value_today,
        MIN(created_at) as first_sale_time,
        MAX(created_at) as last_sale_time
      FROM sales 
      WHERE DATE(created_at) = ?
        AND status = 'completed'
    `, [today]);
    
    const summary = rows[0];
    
    res.json({
      success: true,
      data: {
        date: today,
        total_sales: summary.total_sales_today || 0,
        total_revenue: parseFloat(summary.total_revenue_today) || 0,
        cash_sales: summary.cash_sales || 0,
        card_sales: summary.card_sales || 0,
        online_sales: summary.online_sales || 0,
        avg_order_value: parseFloat(summary.avg_order_value_today) || 0,
        first_sale: summary.first_sale_time,
        last_sale: summary.last_sale_time
      }
    });
    
  } catch (error) {
    console.error('Daily summary error:', error);
    res.json({
      success: true,
      data: null,
      error: error.message
    });
  }
});

module.exports = router;