
import type { JobHandler } from './send-email.js';
import {
  sendEmailHandler,
  generateReportHandler,
  uploadFileHandler,
  sendDlqAlertHandler,
} from './send-email.js';

export interface Logger {
  info(obj: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>): void;
  error(obj: Record<string, unknown>): void;
}

const handlers = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

export function listHandlerTypes(): string[] {
  return [...handlers.keys()];
}

registerHandler('send_email', sendEmailHandler);
registerHandler('generate_report', generateReportHandler);
registerHandler('upload_file', uploadFileHandler);
registerHandler('send_dlq_alert', sendDlqAlertHandler);

export { sendEmailHandler, generateReportHandler, uploadFileHandler, sendDlqAlertHandler };
export type { JobHandler, JobHandlerContext } from './send-email.js';
