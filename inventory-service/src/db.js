const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://inventory:inventory@postgres-inventory:5432/inventory'
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock (
      product_id VARCHAR(64) PRIMARY KEY,
      available INT NOT NULL
    );
  `);
  await pool.query(`
    INSERT INTO stock (product_id, available) VALUES
      ('SKU-100', 50),
      ('SKU-200', 5)
    ON CONFLICT (product_id) DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      order_id UUID PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      quantity INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      correlation_id VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function getStock(productId) {
  const res = await pool.query(`SELECT available FROM stock WHERE product_id = $1`, [productId]);
  return res.rows[0] ? res.rows[0].available : 0;
}

async function reserve(orderId, productId, quantity, correlationId) {
  const existing = await pool.query(`SELECT status FROM reservations WHERE order_id = $1`, [orderId]);
  if (existing.rows.length > 0) {
    return existing.rows[0].status === 'RESERVED';
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stockRes = await client.query(
      `SELECT available FROM stock WHERE product_id = $1 FOR UPDATE`,
      [productId]
    );
    const available = stockRes.rows[0] ? stockRes.rows[0].available : 0;
    if (available < quantity) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE stock SET available = available - $1 WHERE product_id = $2`,
      [quantity, productId]
    );
    await client.query(
      `INSERT INTO reservations (order_id, product_id, quantity, status, correlation_id)
       VALUES ($1, $2, $3, 'RESERVED', $4)`,
      [orderId, productId, quantity, correlationId]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { init, getStock, reserve, pool };