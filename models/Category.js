const { pool } = require('../config/database');

class Category {
  // Get all categories with pagination and search
  static async getAll({ page = 1, limit = 20, search = '', parent_id = null, status = 'active' } = {}) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT c.*, 
             p.name as parent_name,
             (SELECT COUNT(*) FROM products WHERE category_id = c.id AND status = 'active') as product_count
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      query += ' AND (c.name ILIKE $' + (params.length + 1) + ' OR c.description ILIKE $' + (params.length + 1) + ')';
      params.push(`%${search}%`);
    }
    
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === 0) {
        // Get only root categories (no parent)
        query += ' AND c.parent_id IS NULL';
      } else {
        query += ' AND c.parent_id = $' + (params.length + 1);
        params.push(parent_id);
      }
    }
    
    if (status && status !== 'all') {
      query += ' AND c.status = $' + (params.length + 1);
      params.push(status);
    }
    
    query += ' ORDER BY c.sort_order ASC, c.name ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM categories WHERE 1=1';
    const countParams = [];
    
    if (search) {
      countQuery += ' AND (name ILIKE $' + (countParams.length + 1) + ' OR description ILIKE $' + (countParams.length + 1) + ')';
      countParams.push(`%${search}%`);
    }
    
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === 0) {
        countQuery += ' AND parent_id IS NULL';
      } else {
        countQuery += ' AND parent_id = $' + (countParams.length + 1);
        countParams.push(parent_id);
      }
    }
    
    if (status && status !== 'all') {
      countQuery += ' AND status = $' + (countParams.length + 1);
      countParams.push(status);
    }
    
    const { rows: countResult } = await pool.query(countQuery, countParams);
    
    return {
      categories: rows,
      total: parseInt(countResult[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countResult[0].total) / limit)
    };
  }

  // Get category by ID
  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT c.*, p.name as parent_name
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.id = $1`,
      [id]
    );
    
    return rows[0] || null;
  }

  // Get category by slug
  static async findBySlug(slug) {
    const { rows } = await pool.query(
      `SELECT c.*, p.name as parent_name
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.slug = $1 AND c.status = 'active'`,
      [slug]
    );
    
    return rows[0] || null;
  }

  // Create new category
  static async create(categoryData) {
    // Generate slug from name if not provided
    if (!categoryData.slug && categoryData.name) {
      categoryData.slug = this.generateSlug(categoryData.name);
    }
    
    const { rows } = await pool.query(
      `INSERT INTO categories (
        name, slug, description, parent_id, 
        image_url, sort_order, status, meta_title, 
        meta_description, meta_keywords, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        categoryData.name,
        categoryData.slug,
        categoryData.description || null,
        categoryData.parent_id || null,
        categoryData.image_url || null,
        categoryData.sort_order || 0,
        categoryData.status || 'active',
        categoryData.meta_title || null,
        categoryData.meta_description || null,
        categoryData.meta_keywords || null,
        categoryData.created_by
      ]
    );
    
    return rows[0];
  }

  // Update category
  static async update(id, categoryData) {
    // Generate slug from name if name is being updated and slug is not provided
    if (categoryData.name && !categoryData.slug) {
      categoryData.slug = this.generateSlug(categoryData.name);
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    const fields = [
      'name', 'slug', 'description', 'parent_id',
      'image_url', 'sort_order', 'status', 'meta_title',
      'meta_description', 'meta_keywords'
    ];
    
    fields.forEach(field => {
      if (categoryData[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(categoryData[field]);
        paramCount++;
      }
    });
    
    if (updates.length === 0) {
      return await this.findById(id);
    }
    
    // Add updated_at timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    values.push(id);
    
    const { rows } = await pool.query(
      `UPDATE categories 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    return rows[0] || null;
  }

  // Delete category
  static async delete(id) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if category has products
      const { rows: productCheck } = await client.query(
        'SELECT COUNT(*) as product_count FROM products WHERE category_id = $1',
        [id]
      );
      
      if (parseInt(productCheck[0].product_count) > 0) {
        throw new Error('Cannot delete category with existing products. Please reassign or delete products first.');
      }
      
      // Check if category has subcategories
      const { rows: subcategoryCheck } = await client.query(
        'SELECT COUNT(*) as subcategory_count FROM categories WHERE parent_id = $1',
        [id]
      );
      
      if (parseInt(subcategoryCheck[0].subcategory_count) > 0) {
        throw new Error('Cannot delete category with subcategories. Please delete or reassign subcategories first.');
      }
      
      // Delete category
      const { rows } = await client.query(
        'DELETE FROM categories WHERE id = $1 RETURNING *',
        [id]
      );
      
      await client.query('COMMIT');
      return rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get category tree (nested structure)
  static async getCategoryTree(includeInactive = false) {
    const { rows } = await pool.query(`
      WITH RECURSIVE category_tree AS (
        -- Base case: root categories
        SELECT 
          id, 
          name, 
          slug,
          description,
          parent_id,
          image_url,
          sort_order,
          status,
          1 as level,
          ARRAY[id] as path,
          ARRAY[name] as name_path
        FROM categories 
        WHERE parent_id IS NULL
        ${includeInactive ? '' : "AND status = 'active'"}
        
        UNION ALL
        
        -- Recursive case: subcategories
        SELECT 
          c.id, 
          c.name, 
          c.slug,
          c.description,
          c.parent_id,
          c.image_url,
          c.sort_order,
          c.status,
          ct.level + 1 as level,
          ct.path || c.id as path,
          ct.name_path || c.name as name_path
        FROM categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
        ${includeInactive ? '' : "WHERE c.status = 'active'"}
      )
      SELECT * FROM category_tree
      ORDER BY path
    `);
    
    return rows;
  }

  // Get breadcrumb for category
  static async getBreadcrumb(categoryId) {
    const { rows } = await pool.query(`
      WITH RECURSIVE category_path AS (
        SELECT id, name, slug, parent_id, 1 as level
        FROM categories 
        WHERE id = $1
        
        UNION ALL
        
        SELECT c.id, c.name, c.slug, c.parent_id, cp.level + 1
        FROM categories c
        JOIN category_path cp ON c.id = cp.parent_id
      )
      SELECT * FROM category_path ORDER BY level DESC
    `, [categoryId]);
    
    return rows;
  }

  // Get all parent categories (hierarchy)
  static async getParentCategories(categoryId) {
    const { rows } = await pool.query(`
      WITH RECURSIVE parent_categories AS (
        SELECT id, name, slug, parent_id, image_url, status
        FROM categories 
        WHERE id = $1
        
        UNION
        
        SELECT c.id, c.name, c.slug, c.parent_id, c.image_url, c.status
        FROM categories c
        JOIN parent_categories pc ON c.id = pc.parent_id
      )
      SELECT * FROM parent_categories
    `, [categoryId]);
    
    return rows;
  }

  // Get category with all subcategories
  static async getCategoryWithSubcategories(id) {
    const category = await this.findById(id);
    
    if (!category) {
      return null;
    }
    
    const { rows: subcategories } = await pool.query(
      `SELECT * FROM categories 
       WHERE parent_id = $1 AND status = 'active'
       ORDER BY sort_order ASC, name ASC`,
      [id]
    );
    
    return {
      ...category,
      subcategories
    };
  }

  // Get categories with product counts
  static async getCategoriesWithProductCounts(parentId = null, limit = 50) {
    const { rows } = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.slug,
        c.description,
        c.image_url,
        c.parent_id,
        COUNT(p.id) as product_count,
        COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) as active_product_count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
       WHERE c.status = 'active'
       AND ($1::uuid IS NULL OR c.parent_id = $1)
       GROUP BY c.id, c.name, c.slug, c.description, c.image_url, c.parent_id
       ORDER BY c.sort_order ASC, c.name ASC
       LIMIT $2`,
      [parentId, limit]
    );
    
    return rows;
  }

  // Generate slug from name
  static generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/--+/g, '-')     // Replace multiple hyphens with single hyphen
      .trim();                  // Trim whitespace
  }

  // Bulk update category status
  static async bulkUpdateStatus(ids, status) {
    const { rows } = await pool.query(
      `UPDATE categories 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::uuid[])
       RETURNING id, name, status`,
      [status, ids]
    );
    
    return rows;
  }

  // Reorder categories
  static async reorder(categoryOrders) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const order of categoryOrders) {
        await client.query(
          'UPDATE categories SET sort_order = $1 WHERE id = $2',
          [order.sort_order, order.id]
        );
      }
      
      await client.query('COMMIT');
      return true;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get featured categories
  static async getFeaturedCategories(limit = 10) {
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id AND p.status = 'active'
       WHERE c.status = 'active'
       GROUP BY c.id
       HAVING COUNT(p.id) > 0
       ORDER BY product_count DESC
       LIMIT $1`,
      [limit]
    );
    
    return rows;
  }

  // Search categories (for autocomplete)
  static async search(query, limit = 10) {
    const { rows } = await pool.query(
      `SELECT id, name, slug, image_url
       FROM categories 
       WHERE status = 'active'
       AND (name ILIKE $1 OR description ILIKE $1)
       ORDER BY name
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    
    return rows;
  }

  // Get category statistics
  static async getStats() {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_categories,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_categories,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_categories,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_categories,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as subcategories,
        COALESCE(AVG(
          (SELECT COUNT(*) FROM products WHERE category_id = categories.id AND status = 'active')
        ), 0) as avg_products_per_category
      FROM categories
    `);
    
    return rows[0];
  }

  // Check if slug exists
  static async slugExists(slug, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM categories WHERE slug = $1';
    const params = [slug];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count) > 0;
  }
}

module.exports = Category;