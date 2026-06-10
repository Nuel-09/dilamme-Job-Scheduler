import type { FastifyInstance } from 'fastify';
import { listDlqJobs, retryDlqJob, publishJobEvent } from '@scheduler/db';

export async function dlqRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      tags: ['DLQ'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              priority: { type: 'integer' },
              status: { type: 'string' },
              retryCount: { type: 'integer' },
              error: { type: 'string', nullable: true },
              payload: { type: 'object' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
    },
  }, async () => {
    const jobs = await listDlqJobs();
    return jobs.map((j) => ({
      id: j.id,
      type: j.type,
      priority: j.priority,
      status: j.status,
      retryCount: j.retryCount,
      error: j.error,
      payload: j.payload,
      updatedAt: j.updatedAt.toISOString(),
    }));
  });

  app.post('/:id/retry', {
    schema: {
      tags: ['DLQ'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await retryDlqJob(id);
    if (!job) return reply.status(404).send({ error: 'Job not found in DLQ' });

    await publishJobEvent({
      jobId: job.id,
      status: job.status,
      timestamp: new Date().toISOString(),
    });

    request.log.info({ event: 'job.retry', jobId: id, source: 'dlq_manual' });
    return {
      id: job.id,
      status: job.status,
      retryCount: job.retryCount,
      inDlq: job.inDlq,
    };
  });
}
