const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const rabbit = require('./rabbit');
const saga = require('./saga');
const { logger, withCorrelationId } = require('./logger');

const app = express();
app.use(express.json());

// Correlation-ID middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.post('/orders', async (req, res) => {
  const log = withCorrelationId(req.correlationId);
  try {
    const { customerId, productId, quantity } = req.body;
    if (!customerId || !productId || !quantity) {
      return res.status(400).json({ error: 'customerId, productId and quantity are required' });
    }
    const result = await saga.placeOrder(
      { customerId, productId, quantity: Number(quantity) },
      req.correlationId
    );
    log.info({ orderId: result.orderId }, 'Place-order accepted');
    res.status(202).json(result);
  } catch (err) {
    log.error({ err: err.message }, 'Place-order failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/orders/:id', async (req, res) => {
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

async function start() {
  await db.init();
  await rabbit.connect();
  await rabbit.consumeCompensation(saga.compensateOrder);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info({ port }, 'Order service listening');
  });
}

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});