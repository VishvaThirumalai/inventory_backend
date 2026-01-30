// models/User.js
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { name, email, password, role = 'staff', phone } = userData;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, phone) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, phone, status, created_at`,
      [name, email, hashedPassword, role, phone]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT id, name, email, role, phone, status, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async checkPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  static async update(id, userData) {
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    for (const [key, value] of Object.entries(userData)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (fields.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
    
    return this.findById(id);
  }

  static async setResetToken(email, token) {
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);
    
    await pool.query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
      [token, expires, email]
    );
  }

  static async findByResetToken(token) {
    const result = await pool.query(
      'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
      [token]
    );
    return result.rows[0];
  }

  static async clearResetToken(id) {
    await pool.query(
      'UPDATE users SET reset_password_token = NULL, reset_password_expires = NULL WHERE id = $1',
      [id]
    );
  }
}

module.exports = User;