const { v4: uuidv4 } = require('uuid');

function buildOrderPlacedEvent({
  orderId,
  customerId,
  items,
  correlationId
}) {
  if (!orderId || !customerId || !Array.isArray(items) || items.length === 0) {
    throw new Error('Invalid OrderPlaced event data');
  }

  if (items.some(item => !item.sku || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Each item needs a SKU and a positive integer quantity');
  }

  return {
    eventId: uuidv4(),
    type: 'OrderPlaced',
    version: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    data: {
      orderId,
      customerId,
      items
    }
  };
}

function parseStockOutcome(event) {
  if (!event || !event.data || !event.data.orderId) {
    throw new Error('Invalid stock outcome event');
  }

  if (event.type === 'StockReserved') {
    return {
      orderId: event.data.orderId,
      status: 'CONFIRMED'
    };
  }

  if (event.type === 'StockRejected') {
    if (!event.data.reason) {
      throw new Error('StockRejected requires a reason');
    }

    return {
      orderId: event.data.orderId,
      status: 'CANCELLED',
      reason: event.data.reason
    };
  }

  throw new Error(`Unsupported stock outcome: ${event.type}`);
}

module.exports = {
  buildOrderPlacedEvent,
  parseStockOutcome
};