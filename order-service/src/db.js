const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://order:order@postgres-order:5432/orders'
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      quantity INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      correlation_id VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function createOrder({ id, customerId, productId, quantity, status, correlationId }) {
  await pool.query(
    `INSERT INTO orders (id, customer_id, product_id, quantity, status, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, customerId, productId, quantity, status, correlationId]
  );
}

async function updateOrderStatus(id, status) {
  await pool.query(`UPDATE orders SET status = $1 WHERE id = $2`, [status, id]);
}

async function getOrder(id) {
  const res = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
  return res.rows[0];
}

module.exports = { init, createOrder, updateOrderStatus, getOrder, pool };