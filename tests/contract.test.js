/**
 * Contract tests between the Order service and the Inventory service.
 *
 * A contract test checks that what one service SENDS is what the other service EXPECTS,
 * without starting either service, a database or RabbitMQ:
 *
 *   Order service  --OrderPlaced-->  Inventory service
 *   Inventory service --StockReserved / StockRejected--> Order service
 *
 * Two checks are made for every message:
 *   1. the event built by the producer matches the shared JSON schema in /contracts
 *   2. the consumer's own parser accepts the producer's event (and rejects broken ones)
 */
const Ajv = require('ajv');

const orderPlacedSchema = require('../contracts/order-placed.schema.json');
const stockReservedSchema = require('../contracts/stock-reserved.schema.json');
const stockRejectedSchema = require('../contracts/stock-rejected.schema.json');

const { buildOrderPlacedEvent, parseStockOutcome } = require('../order-service/src/events');
const { buildStockReservedEvent, buildStockRejectedEvent, parseOrderPlaced } = require('../inventory-service/src/events');

const ajv = new Ajv({ allErrors: true });
const validateOrderPlaced = ajv.compile(orderPlacedSchema);
const validateStockReserved = ajv.compile(stockReservedSchema);
const validateStockRejected = ajv.compile(stockRejectedSchema);

const orderId = '11111111-1111-4111-8111-111111111111';
const correlationId = 'test-correlation-123';

describe('Contract: OrderPlaced (Order service -> Inventory service)', () => {
  const event = buildOrderPlacedEvent({
    orderId,
    customerId: 'customer-1',
    items: [{ sku: 'LAPTOP-001', quantity: 2 }],
    correlationId,
  });

  test('the event produced by the Order service matches the schema', () => {
    const ok = validateOrderPlaced(event);
    expect(validateOrderPlaced.errors).toBeNull();
    expect(ok).toBe(true);
  });

  test('the Inventory service can read the event produced by the Order service', () => {
    const parsed = parseOrderPlaced(event);
    expect(parsed.orderId).toBe(orderId);
    expect(parsed.items).toEqual([{ sku: 'LAPTOP-001', quantity: 2 }]);
    expect(parsed.correlationId).toBe(correlationId);
  });

  test('the schema rejects an event without an orderId', () => {
    const broken = JSON.parse(JSON.stringify(event));
    delete broken.data.orderId;
    expect(validateOrderPlaced(broken)).toBe(false);
  });

  test('the schema rejects a quantity of zero', () => {
    const broken = JSON.parse(JSON.stringify(event));
    broken.data.items[0].quantity = 0;
    expect(validateOrderPlaced(broken)).toBe(false);
  });

  test('the Inventory service refuses an event without items', () => {
    const broken = JSON.parse(JSON.stringify(event));
    broken.data.items = [];
    expect(() => parseOrderPlaced(broken)).toThrow();
  });
});

describe('Contract: StockReserved (Inventory service -> Order service)', () => {
  const event = buildStockReservedEvent({ orderId, correlationId });

  test('the event produced by the Inventory service matches the schema', () => {
    const ok = validateStockReserved(event);
    expect(validateStockReserved.errors).toBeNull();
    expect(ok).toBe(true);
  });

  test('the Order service reads it as "confirm the order"', () => {
    expect(parseStockOutcome(event)).toMatchObject({ orderId, status: 'CONFIRMED' });
  });
});

describe('Contract: StockRejected (Inventory service -> Order service)', () => {
  const event = buildStockRejectedEvent({ orderId, reason: 'Insufficient stock for KETTLE-003', correlationId });

  test('the event produced by the Inventory service matches the schema', () => {
    const ok = validateStockRejected(event);
    expect(validateStockRejected.errors).toBeNull();
    expect(ok).toBe(true);
  });

  test('the Order service reads it as "cancel the order" and keeps the reason', () => {
    expect(parseStockOutcome(event)).toMatchObject({
      orderId,
      status: 'CANCELLED',
      reason: 'Insufficient stock for KETTLE-003',
    });
  });

  test('the schema rejects a rejection without a reason', () => {
    const broken = JSON.parse(JSON.stringify(event));
    delete broken.data.reason;
    expect(validateStockRejected(broken)).toBe(false);
  });
});