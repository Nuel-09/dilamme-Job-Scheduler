import type { FastifyInstance } from 'fastify';
import { createRedisClient } from '@scheduler/db';
import { REDIS_CHANNELS } from '@scheduler/core';

export async function eventsRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      tags: ['Events'],
      hide: true,
      description: 'Server-Sent Events stream for live job status updates',
    },
  }, async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });

    const subscriber = createRedisClient().duplicate();
    let closed = false;

    const send = (data: unknown) => {
      if (closed) return;
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ kind: 'connected', timestamp: new Date().toISOString() });

    await subscriber.subscribe(REDIS_CHANNELS.JOB_EVENTS);

    subscriber.on('message', (_channel: string, message: string) => {
      try {
        send(JSON.parse(message));
      } catch {
        send({ kind: 'error', message: 'Invalid event payload' });
      }
    });

    const heartbeat = setInterval(() => {
      send({ kind: 'heartbeat', timestamp: new Date().toISOString() });
    }, 15_000);

    request.raw.on('close', async () => {
      closed = true;
      clearInterval(heartbeat);
      await subscriber.unsubscribe(REDIS_CHANNELS.JOB_EVENTS);
      await subscriber.quit();
    });
  });
}
