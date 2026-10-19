const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'inventory-service' },
  timestamp: pino.stdTimeFunctions.isoTime
});

function withCorrelationId(correlationId) {
  return logger.child({ correlationId });
}

module.exports = { logger, withCorrelationId };