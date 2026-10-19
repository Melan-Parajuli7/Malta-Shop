const amqp = require('amqplib');

let channel;

async function connect() {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
  const conn = await amqp.connect(url);
  channel = await conn.createChannel();
  await channel.assertExchange('orders', 'topic', { durable: true });
  await channel.assertQueue('inventory.order.placed', { durable: true });
  await channel.bindQueue('inventory.order.placed', 'orders', 'order.placed');
  return channel;
}

async function publish(routingKey, message, correlationId) {
  if (!channel) await connect();
  channel.publish(
    'orders',
    routingKey,
    Buffer.from(JSON.stringify(message)),
    {
      persistent: true,
      contentType: 'application/json',
      correlationId,
      messageId: message.id || undefined
    }
  );
}

async function consumeOrderPlaced(handler) {
  if (!channel) await connect();
  channel.consume('inventory.order.placed', async (msg) => {
    if (!msg) return;
    try {
      const body = JSON.parse(msg.content.toString());
      await handler(body, msg.properties.correlationId);
      channel.ack(msg);
    } catch (err) {
      channel.nack(msg, false, true);
    }
  });
}

module.exports = { connect, publish, consumeOrderPlaced };