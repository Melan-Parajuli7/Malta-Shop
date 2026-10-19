const express = require('express');
const db = require('./db');
const rabbit = require('./rabbit');
const { logger, withCorrelationId } = require('./logger');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'inventory-service' });
});

async function handleOrderPlaced(event, correlationId) {
  const log = withCorrelationId(correlationId);
  log.info({ orderId: event.id, productId: event.productId, quantity: event.quantity }, 'Received OrderPlaced');

  const success = await db.reserve(event.id, event.productId, event.quantity, correlationId);

  if (success) {
    log.info({ orderId: event.id }, 'Stock reserved successfully');
    // In a fuller saga we would publish InventoryReserved; for the minimal prototype
    // success is silent and the order stays PENDING until a later confirmation step.
  } else {
    log.warn({ orderId: event.id }, 'Insufficient stock – publishing order.failed');
    await rabbit.publish('order.failed', {
      id: event.id,
      type: 'OrderFailed',
      reason: 'INSUFFICIENT_STOCK',
      correlationId
    }, correlationId);
  }
}

async function start() {
  await db.init();
  await rabbit.connect();
  await rabbit.consumeOrderPlaced(handleOrderPlaced);
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    logger.info({ port }, 'Inventory service listening');
  });
}

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});