// email handler for the job scheduler
import type { Logger } from './registry.js';

export interface JobHandlerContext {
  jobId: string;
  payload: Record<string, unknown>;
  logger: Logger;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<void>;

export interface EmailPayload {
  to: string;
  subject: string;
  body?: string;
}

/** Track deterministic message IDs for idempotent send_email. */
const sentMessageIds = new Set<string>();

function validateEmailPayload(payload: Record<string, unknown>): EmailPayload {
  const to = payload.to;
  const subject = payload.subject;
  if (typeof to !== 'string' || !to.includes('@')) {
    throw new Error('Invalid payload: "to" must be a valid email string');
  }
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    throw new Error('Invalid payload: "subject" is required');
  }
  return {
    to,
    subject,
    body: typeof payload.body === 'string' ? payload.body : undefined,
  };
}

/**
 * Simulates SMTP with ~10% random failure rate.
 * Uses jobId as deterministic idempotency key — duplicate invocations skip re-send.
 */
export async function sendEmailHandler(ctx: JobHandlerContext): Promise<void> {
  const email = validateEmailPayload(ctx.payload);
  const messageId = `msg-id-${ctx.jobId}`;

  if (sentMessageIds.has(messageId)) {
    ctx.logger.info({
      event: 'handler.send_email.duplicate',
      jobId: ctx.jobId,
      messageId,
      message: `Duplicate send detected for ${messageId}, skipping.`,
    });
    return;
  }

  ctx.logger.info({
    event: 'handler.send_email.attempt',
    jobId: ctx.jobId,
    to: email.to,
    subject: email.subject,
    messageId,
  });

  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  if (Math.random() < 0.1) {
    throw new Error(`SMTP simulation failed: connection reset for ${email.to}`);
  }

  sentMessageIds.add(messageId);

  ctx.logger.info({
    event: 'handler.send_email.success',
    jobId: ctx.jobId,
    to: email.to,
    subject: email.subject,
    messageId,
  });
}

export async function generateReportHandler(ctx: JobHandlerContext): Promise<void> {
  ctx.logger.info({ event: 'handler.generate_report.start', jobId: ctx.jobId });
  await new Promise((resolve) => setTimeout(resolve, 300));
  ctx.logger.info({
    event: 'handler.generate_report.success',
    jobId: ctx.jobId,
    reportPath: '/tmp/report.pdf',
  });
}

export async function uploadFileHandler(ctx: JobHandlerContext): Promise<void> {
  ctx.logger.info({ event: 'handler.upload_file.start', jobId: ctx.jobId });
  await new Promise((resolve) => setTimeout(resolve, 200));
  ctx.logger.info({
    event: 'handler.upload_file.success',
    jobId: ctx.jobId,
    destination: ctx.payload.destination ?? 's3://default',
  });
}

export async function sendDlqAlertHandler(ctx: JobHandlerContext): Promise<void> {
  const count = ctx.payload.dlqCount;
  const threshold = ctx.payload.threshold;
  ctx.logger.warn({
    event: 'dlq.threshold_exceeded',
    jobId: ctx.jobId,
    dlqCount: count,
    threshold,
    adminEmail: ctx.payload.adminEmail,
  });
}

/** Test helper — reset idempotency cache between test runs. */
export function resetSendEmailIdempotencyCache(): void {
  sentMessageIds.clear();
}
