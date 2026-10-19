const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const rabbit = require('./rabbit');
const { withCorrelationId } = require('./logger');

async function placeOrder({ customerId, productId, quantity }, correlationId) {
  const log = withCorrelationId(correlationId);
  const orderId = uuidv4();

  await db.createOrder({
    id: orderId,
    customerId,
    productId,
    quantity,
    status: 'PENDING',
    correlationId
  });
  log.info({ orderId, productId, quantity }, 'Order created in PENDING state');

  const event = {
    id: orderId,
    type: 'OrderPlaced',
    customerId,
    productId,
    quantity,
    correlationId
  };

  await rabbit.publish('order.placed', event, correlationId);
  log.info({ orderId }, 'OrderPlaced event published');

  return { orderId, status: 'PENDING' };
}

async function compensateOrder(failedEvent, correlationId) {
  const log = withCorrelationId(correlationId);
  const orderId = failedEvent.id;

  const existing = await db.getOrder(orderId);
  if (!existing) {
    log.warn({ orderId }, 'Compensation received for unknown order – ignoring');
    return;
  }
  if (existing.status === 'CANCELLED') {
    log.info({ orderId }, 'Order already compensated – idempotent no-op');
    return;
  }

  await db.updateOrderStatus(orderId, 'CANCELLED');
  log.info({ orderId, reason: failedEvent.reason }, 'Order compensated (CANCELLED)');
}

module.exports = { placeOrder, compensateOrder };