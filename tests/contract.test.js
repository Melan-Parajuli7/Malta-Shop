'use strict';

const Ajv = require('ajv');

const orderPlacedSchema = require('../contracts/order-placed.schema.json');
const stockReservedSchema = require('../contracts/stock-reserved.schema.json');
const stockRejectedSchema = require('../contracts/stock-rejected.schema.json');

const {
  buildOrderPlacedEvent,
  parseStockOutcome,
} = require('../order-service/src/events');

const {
  buildStockReservedEvent,
  buildStockRejectedEvent,
  parseOrderPlaced,
} = require('../inventory-service/src/events');

// Ajv v8 rejects draft-07 `$schema` under strict mode unless the meta-schema is
// registered. `strict: false` keeps things simple while still validating.
const ajv = new Ajv({ allErrors: true, strict: false });

const validateOrderPlaced = ajv.compile(orderPlacedSchema);
const validateStockReserved = ajv.compile(stockReservedSchema);
const validateStockRejected = ajv.compile(stockRejectedSchema);

const UUID_V4 =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const CORRELATION_ID = 'corr-abc-123456';

function expectValid(validate, value) {
  const ok = validate(value);
  if (!ok) {
    // Dump the Ajv errors so failures are actionable.
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(validate.errors, null, 2));
  }
  expect(ok).toBe(true);
}

describe('contract: order-placed', () => {
  test('buildOrderPlacedEvent produces an event that satisfies the schema', () => {
    const event = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [
        { sku: 'SKU-001', quantity: 1 },
        { sku: 'SKU-002', quantity: 3 },
      ],
      correlationId: CORRELATION_ID,
    });

    expectValid(validateOrderPlaced, event);
    expect(event.eventId).toMatch(UUID_V4);
    expect(event.type).toBe('OrderPlaced');
    expect(event.version).toBe(1);
    expect(event.correlationId).toBe(CORRELATION_ID);
    expect(event.data.orderId).toBe(ORDER_ID);
    expect(event.data.items).toHaveLength(2);
  });

  test('schema rejects an OrderPlaced with a missing customerId', () => {
    const event = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 1 }],
      correlationId: CORRELATION_ID,
    });
    delete event.data.customerId;

    expect(validateOrderPlaced(event)).toBe(false);
  });

  test('schema rejects an OrderPlaced with a non-positive quantity', () => {
    const event = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 1 }],
      correlationId: CORRELATION_ID,
    });
    event.data.items[0].quantity = 0;

    expect(validateOrderPlaced(event)).toBe(false);
  });

  test('schema rejects unknown top-level properties', () => {
    const event = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 1 }],
      correlationId: CORRELATION_ID,
    });
    event.unexpected = 'nope';

    expect(validateOrderPlaced(event)).toBe(false);
  });
});

describe('contract: inventory consumes OrderPlaced', () => {
  test('parseOrderPlaced extracts the fields the inventory service needs', () => {
    const event = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 2 }],
      correlationId: CORRELATION_ID,
    });

    expectValid(validateOrderPlaced, event);

    const parsed = parseOrderPlaced(event);
    expect(parsed).toEqual({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 2 }],
      correlationId: CORRELATION_ID,
    });
  });

  test('parseOrderPlaced rejects an event of the wrong type', () => {
    const event = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 1 }],
      correlationId: CORRELATION_ID,
    });
    event.type = 'SomethingElse';

    expect(() => parseOrderPlaced(event)).toThrow();
  });
});

describe('contract: stock-reserved', () => {
  test('buildStockReservedEvent satisfies the schema and round-trips through parseStockOutcome', () => {
    const event = buildStockReservedEvent({
      orderId: ORDER_ID,
      correlationId: CORRELATION_ID,
    });

    expectValid(validateStockReserved, event);
    expect(event.eventId).toMatch(UUID_V4);
    expect(event.type).toBe('StockReserved');

    const outcome = parseStockOutcome(event);
    expect(outcome).toEqual({ orderId: ORDER_ID, status: 'CONFIRMED' });
  });

  test('schema rejects StockReserved carrying extra data fields', () => {
    const event = buildStockReservedEvent({
      orderId: ORDER_ID,
      correlationId: CORRELATION_ID,
    });
    event.data.reason = 'not allowed here';

    expect(validateStockReserved(event)).toBe(false);
  });
});

describe('contract: stock-rejected', () => {
  test('buildStockRejectedEvent satisfies the schema and round-trips through parseStockOutcome', () => {
    const event = buildStockRejectedEvent({
      orderId: ORDER_ID,
      reason: 'OUT_OF_STOCK',
      correlationId: CORRELATION_ID,
    });

    expectValid(validateStockRejected, event);
    expect(event.eventId).toMatch(UUID_V4);
    expect(event.type).toBe('StockRejected');

    const outcome = parseStockOutcome(event);
    expect(outcome).toEqual({
      orderId: ORDER_ID,
      status: 'CANCELLED',
      reason: 'OUT_OF_STOCK',
    });
  });

  test('schema rejects StockRejected with an empty reason', () => {
    const event = buildStockRejectedEvent({
      orderId: ORDER_ID,
      reason: 'OUT_OF_STOCK',
      correlationId: CORRELATION_ID,
    });
    event.data.reason = '';

    expect(validateStockRejected(event)).toBe(false);
  });

  test('parseStockOutcome rejects StockRejected without a reason', () => {
    const event = buildStockRejectedEvent({
      orderId: ORDER_ID,
      reason: 'OUT_OF_STOCK',
      correlationId: CORRELATION_ID,
    });
    delete event.data.reason;

    expect(() => parseStockOutcome(event)).toThrow(/reason/i);
  });
});

describe('contract: full saga round-trip', () => {
  test('OrderPlaced → StockReserved confirms the order', () => {
    const placed = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 1 }],
      correlationId: CORRELATION_ID,
    });
    expectValid(validateOrderPlaced, placed);

    const parsed = parseOrderPlaced(placed);
    const reserved = buildStockReservedEvent({
      orderId: parsed.orderId,
      correlationId: parsed.correlationId,
    });
    expectValid(validateStockReserved, reserved);

    expect(parseStockOutcome(reserved).status).toBe('CONFIRMED');
  });

  test('OrderPlaced → StockRejected cancels the order', () => {
    const placed = buildOrderPlacedEvent({
      orderId: ORDER_ID,
      customerId: 'cust-42',
      items: [{ sku: 'SKU-001', quantity: 1 }],
      correlationId: CORRELATION_ID,
    });
    expectValid(validateOrderPlaced, placed);

    const parsed = parseOrderPlaced(placed);
    const rejected = buildStockRejectedEvent({
      orderId: parsed.orderId,
      reason: 'OUT_OF_STOCK',
      correlationId: parsed.correlationId,
    });
    expectValid(validateStockRejected, rejected);

    const outcome = parseStockOutcome(rejected);
    expect(outcome.status).toBe('CANCELLED');
    expect(outcome.reason).toBe('OUT_OF_STOCK');
  });
});