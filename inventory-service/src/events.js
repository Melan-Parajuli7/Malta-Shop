const { v4: uuidv4 } = require('uuid');

function buildStockReservedEvent({ orderId, correlationId }) {
  if (!orderId || !correlationId) {
    throw new Error('orderId and correlationId are required');
  }

  return {
    eventId: uuidv4(),
    type: 'StockReserved',
    version: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    data: { orderId }
  };
}

function buildStockRejectedEvent({ orderId, reason, correlationId }) {
  if (!orderId || !reason || !correlationId) {
    throw new Error('orderId, reason and correlationId are required');
  }

  return {
    eventId: uuidv4(),
    type: 'StockRejected',
    version: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    data: { orderId, reason }
  };
}

function parseOrderPlaced(event) {
  const data = event && event.data;

  if (
    !event ||
    event.type !== 'OrderPlaced' ||
    !data ||
    !data.orderId ||
    !data.customerId ||
    !Array.isArray(data.items) ||
    data.items.length === 0 ||
    data.items.some(item =>
      !item.sku ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
  ) {
    throw new Error('Invalid OrderPlaced event');
  }

  return {
    orderId: data.orderId,
    customerId: data.customerId,
    items: data.items,
    correlationId: event.correlationId
  };
}

module.exports = {
  buildStockReservedEvent,
  buildStockRejectedEvent,
  parseOrderPlaced
};