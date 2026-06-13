import '@scheduler/db/load-env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { getBenchmarkReport } from '@scheduler/core';
import { closeDb, closeRedis, checkDbConnection, checkRedisConnection } from '@scheduler/db';
import { jobsRoutes } from './routes/jobs.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { dlqRoutes } from './routes/dlq.js';
import { eventsRoutes } from './routes/events.js';

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3200);
const HOST = process.env.API_HOST ?? process.env.HOST ?? '0.0.0.0';
const LOCAL_API_URL = `http://localhost:${PORT}`;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL?.replace(/\/$/, '');

/** Relative "/" resolves to the host serving /docs (Vite :5173, API :3200, or VPS domain). */
const swaggerServers = [
  { url: '/', description: 'Current host' },
  ...(PUBLIC_API_URL && PUBLIC_API_URL !== LOCAL_API_URL
    ? [{ url: PUBLIC_API_URL, description: 'Production' }]
    : []),
  { url: LOCAL_API_URL, description: 'localhost only' },
];

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  trustProxy: true,
});

await app.register(cors, { origin: true });

await app.register(swagger, {
  openapi: {
    info: {
      title: 'Stage 9 Job Scheduler API',
      description: 'Background job scheduler with heap-based priority queue, DAG workflows, and DLQ',
      version: '1.0.0',
    },
    servers: swaggerServers,
  },
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
});

await app.register(jobsRoutes, { prefix: '/api/jobs' });
await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
await app.register(dlqRoutes, { prefix: '/api/dlq' });
await app.register(eventsRoutes, { prefix: '/api/events' });

app.get('/api/benchmarks', {
  schema: {
    tags: ['Benchmarks'],
    response: {
      200: {
        type: 'object',
        properties: {
          generatedAt: { type: 'string' },
          results: { type: 'array' },
        },
      },
    },
  },
}, async () => getBenchmarkReport());

app.get('/health', async (_request, reply) => {
  const [db, redis] = await Promise.all([checkDbConnection(), checkRedisConnection()]);
  const status = db && redis ? 'ok' : 'degraded';
  const code = db && redis ? 200 : 503;
  return reply.status(code).send({
    status,
    db: db ? 'connected' : 'disconnected',
    redis: redis ? 'connected' : 'disconnected',
  });
});

const shutdown = async () => {
  await app.close();
  await closeDb();
  await closeRedis();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API listening on http://${HOST}:${PORT}`);
  app.log.info(`Swagger docs at http://${HOST}:${PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
