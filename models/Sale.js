const { pool } = require('../config/database');

class Sale {
  // Get all sales with pagination and filters
  static async getAll({ page = 1, limit = 20, startDate, endDate, status, payment_method } = {}) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT s.*, u.name as sold_by_name,
             (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as items_count
      FROM sales s
      LEFT JOIN users u ON s.sold_by = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (startDate) {
      query += ' AND DATE(s.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(s.created_at) <= ?';
      params.push(endDate);
    }
    
    if (status && status !== 'all') {
      query += ' AND s.status = ?';
      params.push(status);
    }
    
    if (payment_method && payment_method !== 'all') {
      query += ' AND s.payment_method = ?';
      params.push(payment_method);
    }
    
    query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [rows] = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM sales WHERE 1=1';
    const countParams = [];
    
    if (startDate) {
      countQuery += ' AND DATE(created_at) >= ?';
      countParams.push(startDate);
    }
    
    if (endDate) {
      countQuery += ' AND DATE(created_at) <= ?';
      countParams.push(endDate);
    }
    
    if (status && status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    
    // Calculate REAL summary statistics
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(AVG(final_amount), 0) as average_sale,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status = 'completed' THEN final_amount ELSE 0 END), 0) as today_revenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status = 'completed' THEN 1 ELSE 0 END), 0) as today_sales
      FROM sales 
      WHERE status = 'completed'
    `);
    
    return {
      sales: rows,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(countResult[0].total / limit),
      summary: stats[0]
    };
  }

  // Find sale by ID with items
  static async findById(id) {
    // Get sale info
    const [saleRows] = await pool.query(
      `SELECT s.*, u.name as sold_by_name 
       FROM sales s
       LEFT JOIN users u ON s.sold_by = u.id
       WHERE s.id = ?`,
      [id]
    );
    
    if (saleRows.length === 0) return null;
    
    const sale = saleRows[0];
    
    // Get sale items
    const [items] = await pool.query(
      `SELECT si.*, p.name as product_name, p.sku, p.unit
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [id]
    );
    
    return {
      ...sale,
      items
    };
  }

  // Generate unique invoice number
  static async generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Get today's invoice count
    const [countRows] = await pool.query(
      'SELECT COUNT(*) as count FROM sales WHERE DATE(created_at) = CURDATE()'
    );
    
    const count = countRows[0].count + 1;
    const invoiceNumber = `INV-${year}${month}${day}-${String(count).padStart(4, '0')}`;
    
    return invoiceNumber;
  }

  // Create new sale with transaction
  static async create(saleData, items) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Generate unique invoice number
      const invoiceNumber = await this.generateInvoiceNumber();
      
      // Create sale
      const [saleResult] = await connection.query(
        `INSERT INTO sales (
          invoice_number, customer_name, customer_email, customer_phone,
          total_amount, discount_amount, tax_amount, final_amount,
          amount_paid, change_amount,
          payment_method, payment_status, status, sold_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          saleData.customer_name || null,
          saleData.customer_email || null,
          saleData.customer_phone || null,
          parseFloat(saleData.total_amount || 0),
          parseFloat(saleData.discount_amount || 0),
          parseFloat(saleData.tax_amount || 0),
          parseFloat(saleData.final_amount || 0),
          parseFloat(saleData.amount_paid || 0),
          parseFloat(saleData.change_amount || 0),
          saleData.payment_method || 'cash',
          saleData.payment_status || 'paid',
          saleData.status || 'completed',
          saleData.sold_by,
          saleData.notes || null
        ]
      );
      
      const saleId = saleResult.insertId;
      
      // Add sale items and update stock
      for (const item of items) {
        // Insert sale item
        await connection.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?)`,
          [
            saleId, 
            item.product_id, 
            parseInt(item.quantity), 
            parseFloat(item.unit_price), 
            parseFloat(item.total_price)
          ]
        );
        
        // Get current stock before update
        const [productRows] = await connection.query(
          'SELECT current_stock FROM products WHERE id = ? FOR UPDATE',
          [item.product_id]
        );
        
        if (productRows.length > 0) {
          const previousStock = productRows[0].current_stock;
          const newStock = previousStock - parseInt(item.quantity);
          
          // Update product stock
          await connection.query(
            'UPDATE products SET current_stock = current_stock - ? WHERE id = ?',
            [parseInt(item.quantity), item.product_id]
          );
          
          // Record stock movement
          await connection.query(
            `INSERT INTO stock_movements (
              product_id, movement_type, quantity, previous_stock, new_stock,
              reference_type, reference_id, created_by, notes
            ) VALUES (?, 'out', ?, ?, ?, 'sale', ?, ?, ?)`,
            [
              item.product_id,
              parseInt(item.quantity),
              parseInt(previousStock),
              parseInt(newStock),
              saleId,
              saleData.sold_by,
              `Sale ${invoiceNumber} - ${item.quantity} units`
            ]
          );
        }
      }
      
      await connection.commit();
      
      // Return created sale with items
      return await this.findById(saleId);
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
static async updateStatus(id, updateData, userId) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Update sale
    await connection.query(
      `UPDATE sales 
       SET status = ?, payment_status = ?, amount_paid = ?, change_amount = ?, payment_method = ?
       WHERE id = ?`,
      [
        updateData.status,
        updateData.payment_status,
        parseFloat(updateData.amount_paid),
        parseFloat(updateData.change_amount || 0),
        updateData.payment_method,
        id
      ]
    );
    
    // Record the payment transaction if needed - try-catch in case table doesn't exist
    try {
      await connection.query(
        `INSERT INTO payment_transactions (
          sale_id, amount, payment_method, processed_by, notes
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          parseFloat(updateData.amount_paid),
          updateData.payment_method,
          userId,
          `Payment received to complete sale`
        ]
      );
    } catch (error) {
      // If payment_transactions table doesn't exist, just log and continue
      console.warn('payment_transactions table might not exist:', error.message);
      // Continue with the transaction since this is optional
    }
    
    await connection.commit();
    
    // Return updated sale
    return await this.findById(id);
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
  // Cancel sale and restore stock
  static async cancel(id, userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // First, check if sale exists and get its status
      const [saleRows] = await connection.query(
        'SELECT * FROM sales WHERE id = ? FOR UPDATE',
        [id]
      );
      
      if (saleRows.length === 0) {
        throw new Error('Sale not found');
      }
      
      const sale = saleRows[0];
      
      // Check if sale can be cancelled
      if (sale.status === 'cancelled') {
        throw new Error('Sale is already cancelled');
      }
      
      if (sale.status === 'refunded') {
        throw new Error('Sale is already refunded');
      }
      
      // Get sale items
      const [items] = await connection.query(
        'SELECT * FROM sale_items WHERE sale_id = ?',
        [id]
      );
      
      // Restore stock for each item
      for (const item of items) {
        // Get current stock
        const [productRows] = await connection.query(
          'SELECT current_stock FROM products WHERE id = ? FOR UPDATE',
          [item.product_id]
        );
        
        if (productRows.length > 0) {
          const previousStock = productRows[0].current_stock;
          const newStock = previousStock + parseInt(item.quantity);
          
          // Restore stock
          await connection.query(
            'UPDATE products SET current_stock = current_stock + ? WHERE id = ?',
            [parseInt(item.quantity), item.product_id]
          );
          
          // Record stock movement for return
          await connection.query(
            `INSERT INTO stock_movements (
              product_id, movement_type, quantity, previous_stock, new_stock,
              reference_type, reference_id, created_by, notes
            ) VALUES (?, 'in', ?, ?, ?, 'return', ?, ?, ?)`,
            [
              item.product_id,
              parseInt(item.quantity),
              parseInt(previousStock),
              parseInt(newStock),
              id,
              userId,
              'Sale cancellation - stock restored'
            ]
          );
        }
      }
      
      // Update sale status
      await connection.query(
        'UPDATE sales SET status = "cancelled", payment_status = "refunded" WHERE id = ?',
        [id]
      );
      
      await connection.commit();
      return true;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Refund sale
  static async refund(id, userId, notes = '') {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // First, check if sale exists and get its status
      const [saleRows] = await connection.query(
        'SELECT * FROM sales WHERE id = ? FOR UPDATE',
        [id]
      );
      
      if (saleRows.length === 0) {
        throw new Error('Sale not found');
      }
      
      const sale = saleRows[0];
      
      // Check if sale can be refunded
      if (sale.status === 'refunded') {
        throw new Error('Sale is already refunded');
      }
      
      if (sale.status === 'cancelled') {
        throw new Error('Sale is already cancelled');
      }
      
      // Get sale items
      const [items] = await connection.query(
        'SELECT * FROM sale_items WHERE sale_id = ?',
        [id]
      );
      
      // Restore stock for each item
      for (const item of items) {
        // Get current stock
        const [productRows] = await connection.query(
          'SELECT current_stock FROM products WHERE id = ? FOR UPDATE',
          [item.product_id]
        );
        
        if (productRows.length > 0) {
          const previousStock = productRows[0].current_stock;
          const newStock = previousStock + parseInt(item.quantity);
          
          // Restore stock
          await connection.query(
            'UPDATE products SET current_stock = current_stock + ? WHERE id = ?',
            [parseInt(item.quantity), item.product_id]
          );
          
          // Record stock movement for return
          await connection.query(
            `INSERT INTO stock_movements (
              product_id, movement_type, quantity, previous_stock, new_stock,
              reference_type, reference_id, created_by, notes
            ) VALUES (?, 'in', ?, ?, ?, 'return', ?, ?, ?)`,
            [
              item.product_id,
              parseInt(item.quantity),
              parseInt(previousStock),
              parseInt(newStock),
              id,
              userId,
              notes || 'Sale refund'
            ]
          );
        }
      }
      
      // Update sale status - FIXED: Use proper enum values
      const existingNotes = sale.notes || '';
      const refundNote = `\nRefunded on ${new Date().toISOString()}: ${notes}`;
      
      await connection.query(
        'UPDATE sales SET status = "refunded", payment_status = "refunded", notes = CONCAT(?, ?) WHERE id = ?',
        [existingNotes, refundNote, id]
      );
      
      await connection.commit();
      return true;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get sales statistics
  static async getSalesStats(period = 'today') {
    let dateFilter = '';
    let params = [];
    
    switch(period) {
      case 'today':
        dateFilter = 'AND DATE(s.created_at) = CURDATE()';
        break;
      case 'week':
        dateFilter = 'AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        break;
      case 'month':
        dateFilter = 'AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        break;
      default:
        dateFilter = '';
    }
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(s.final_amount), 0) as total_revenue,
        COALESCE(AVG(s.final_amount), 0) as average_sale,
        COALESCE(MIN(s.final_amount), 0) as min_sale,
        COALESCE(MAX(s.final_amount), 0) as max_sale
      FROM sales s
      WHERE s.status = 'completed'
      ${dateFilter}
    `, params);
    
    return stats[0];
  }

  // Get daily sales for chart
  static async getDailySales(days = 7) {
    const [rows] = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_sales,
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(AVG(final_amount), 0) as average_sale
       FROM sales 
       WHERE status = 'completed'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at) 
       ORDER BY date`,
      [days]
    );
    return rows;
  }

  // Get top selling products
  static async getTopProducts(limit = 5) {
    const [rows] = await pool.query(
      `SELECT 
        p.id,
        p.name,
        p.sku,
        SUM(si.quantity) as total_sold,
        SUM(si.total_price) as total_revenue
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       JOIN sales s ON si.sale_id = s.id
       WHERE s.status = 'completed'
       GROUP BY p.id
       ORDER BY total_sold DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }
}

module.exports = Sale;