const amqp = require('amqplib');

let channel;

async function connect() {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
  const conn = await amqp.connect(url);
  channel = await conn.createChannel();
  await channel.assertExchange('orders', 'topic', { durable: true });
  await channel.assertQueue('order.compensation', { durable: true });
  await channel.bindQueue('order.compensation', 'orders', 'order.failed');
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

async function consumeCompensation(handler) {
  if (!channel) await connect();
  channel.consume('order.compensation', async (msg) => {
    if (!msg) return;
    try {
      const body = JSON.parse(msg.content.toString());
      await handler(body, msg.properties.correlationId);
      channel.ack(msg);
    } catch (err) {
      channel.nack(msg, false, false);
    }
  });
}

module.exports = { connect, publish, consumeCompensation };