import type { FastifyInstance } from 'fastify';
import { getDashboardStats } from '@scheduler/db';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/stats', {
    schema: {
      tags: ['Dashboard'],
      response: {
        200: {
          type: 'object',
          properties: {
            pending: { type: 'integer' },
            processing: { type: 'integer' },
            completed: { type: 'integer' },
            failed: { type: 'integer' },
            cancelled: { type: 'integer' },
            dlq: { type: 'integer' },
          },
        },
      },
    },
  }, async () => getDashboardStats());
}
