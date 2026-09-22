import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { rabbitMQ } from './connection';

const integrationEnabled = Boolean(process.env.RABBITMQ_URL);

test('RabbitMQ publica, consome e confirma mensagens', { skip: !integrationEnabled }, async () => {
    await rabbitMQ.connect(5, 100);
    const channel = rabbitMQ.requireChannel();
    const queue = `cognivault_test_${randomUUID()}`;
    await channel.assertQueue(queue, { durable: false, autoDelete: true });

    const payload = Buffer.from(JSON.stringify({ test: randomUUID() }));
    channel.sendToQueue(queue, payload, { persistent: false });
    await channel.waitForConfirms();

    const message = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('RabbitMQ consumer timeout')), 5_000);
        void channel.consume(queue, (received) => {
            if (!received) return;
            clearTimeout(timer);
            channel.ack(received);
            resolve(received.content);
        }, { noAck: false });
    });

    assert.deepEqual(message, payload);
    await channel.deleteQueue(queue);
});

test('RabbitMQ encaminha mensagens expiradas para dead-letter', { skip: !integrationEnabled }, async () => {
    await rabbitMQ.connect(5, 100);
    const channel = rabbitMQ.requireChannel();
    const suffix = randomUUID();
    const deadLetterQueue = `cognivault_dead_letter_${suffix}`;
    const retryQueue = `cognivault_retry_${suffix}`;
    await channel.assertQueue(deadLetterQueue, { durable: false, autoDelete: true });
    await channel.assertQueue(retryQueue, {
        durable: false,
        autoDelete: true,
        arguments: {
            'x-message-ttl': 50,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': deadLetterQueue,
        },
    });

    const payload = Buffer.from(`retry-${suffix}`);
    channel.sendToQueue(retryQueue, payload);
    await channel.waitForConfirms();
    const deadLetter = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('RabbitMQ dead-letter timeout')), 5_000);
        void channel.consume(deadLetterQueue, (received) => {
            if (!received) return;
            clearTimeout(timer);
            channel.ack(received);
            resolve(received.content);
        }, { noAck: false });
    });

    assert.deepEqual(deadLetter, payload);
    await channel.deleteQueue(retryQueue);
    await channel.deleteQueue(deadLetterQueue);
});

test('RabbitMQ reconecta depois de shutdown explícito e encerra sem deixar canal ativo', { skip: !integrationEnabled }, async () => {
    await rabbitMQ.connect(5, 100);
    assert.equal(rabbitMQ.isReady(), true);
    await rabbitMQ.close();
    assert.equal(rabbitMQ.isReady(), false);
    await rabbitMQ.connect(5, 100);
    assert.equal(rabbitMQ.isReady(), true);
    await rabbitMQ.close();
    assert.equal(rabbitMQ.isReady(), false);
});
