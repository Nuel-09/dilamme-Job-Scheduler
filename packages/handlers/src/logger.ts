import type { Logger } from './registry.js';

function writeLog(level: string, obj: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    ...obj,
  });
  process.stdout.write(`${line}\n`);
}

/** Standalone JSON logger for handler scripts and tests. */
export function createHandlerLogger(): Logger {
  return {
    info(obj) {
      writeLog('info', obj);
    },
    warn(obj) {
      writeLog('warn', obj);
    },
    error(obj) {
      writeLog('error', obj);
    },
  };
}
