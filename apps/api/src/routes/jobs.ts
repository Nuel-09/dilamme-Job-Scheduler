import type { FastifyInstance } from 'fastify';
import {
  createJob,
  getJobById,
  listJobs,
  cancelJob,
  getJobDependencies,
  getJobLogs,
  listJobsForDependencyPicker,
  publishJobEvent,
} from '@scheduler/db';
import type { JobInterval, JobPriority } from '@scheduler/core';

const jobSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    payload: { type: 'object' },
    priority: { type: 'integer' },
    status: { type: 'string' },
    retryCount: { type: 'integer' },
    maxRetries: { type: 'integer' },
    scheduledAt: { type: 'string', nullable: true },
    interval: { type: 'string', nullable: true },
    error: { type: 'string', nullable: true },
    inDlq: { type: 'boolean' },
    effectivePriority: { type: 'integer' },
    cancelRequested: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    startedAt: { type: 'string', nullable: true },
    completedAt: { type: 'string', nullable: true },
  },
};

function serializeJob(job: Awaited<ReturnType<typeof getJobById>>) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    payload: job.payload,
    priority: job.priority,
    status: job.status,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    interval: job.interval,
    error: job.error,
    inDlq: job.inDlq,
    effectivePriority: job.effectivePriority,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

export async function jobsRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: {
      tags: ['Jobs'],
      body: {
        type: 'object',
        required: ['type', 'payload'],
        properties: {
          type: { type: 'string' },
          payload: { type: 'object' },
          priority: { type: 'integer', enum: [1, 2, 3] },
          scheduled_at: { type: 'string', format: 'date-time' },
          interval: { type: 'string', enum: ['every_1_minute', 'every_5_minutes', 'every_1_hour'] },
          depends_on: { type: 'array', items: { type: 'string' } },
          max_retries: { type: 'integer', minimum: 0, maximum: 10 },
        },
      },
      response: { 201: jobSchema, 400: errorSchema },
    },
  }, async (request, reply) => {
    const body = request.body as {
      type: string;
      payload: Record<string, unknown>;
      priority?: JobPriority;
      scheduled_at?: string;
      interval?: JobInterval;
      depends_on?: string[];
      max_retries?: number;
    };

    try {
      const job = await createJob({
        type: body.type,
        payload: body.payload,
        priority: body.priority,
        scheduledAt: body.scheduled_at ? new Date(body.scheduled_at) : undefined,
        interval: body.interval,
        dependsOn: body.depends_on,
        maxRetries: body.max_retries,
      });

      await publishJobEvent({
        jobId: job.id,
        status: job.status,
        type: job.type,
        timestamp: new Date().toISOString(),
      });

      request.log.info({
        event: 'job.created',
        jobId: job.id,
        type: job.type,
        priority: job.priority,
      });

      return reply.status(201).send(serializeJob(job));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/', {
    schema: {
      tags: ['Jobs'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          limit: { type: 'integer' },
        },
      },
      response: {
        200: { type: 'array', items: jobSchema },
      },
    },
  }, async (request) => {
    const query = request.query as { status?: string; limit?: number };
    const jobs = await listJobs({
      status: query.status as Parameters<typeof listJobs>[0] extends infer T ? T extends { status?: infer S } ? S : never : never,
      limit: query.limit,
    });
    return jobs.map((j) => serializeJob(j)!);
  });

  app.get('/dependency-options', {
    schema: {
      tags: ['Jobs'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
  }, async () => listJobsForDependencyPicker());

  app.get('/:id', {
    schema: {
      tags: ['Jobs'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: { 200: jobSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await getJobById(id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const deps = await getJobDependencies(id);
    const logs = await getJobLogs(id);
    return {
      ...serializeJob(job),
      dependsOn: deps,
      logs: logs.map((l) => ({
        id: l.id,
        event: l.event,
        message: l.message,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  });

  app.patch('/:id/cancel', {
    schema: {
      tags: ['Jobs'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: { 200: jobSchema, 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const job = await cancelJob(id);
      if (!job) return reply.status(404).send({ error: 'Job not found' });

      await publishJobEvent({
        jobId: job.id,
        status: job.status,
        timestamp: new Date().toISOString(),
      });

      request.log.info({ event: 'job.cancelled', jobId: id });
      return serializeJob(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cancel failed';
      return reply.status(400).send({ error: message });
    }
  });
}
