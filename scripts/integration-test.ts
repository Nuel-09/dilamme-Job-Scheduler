/**
 * Batch 4–6 integration smoke tests.
 * Requires API, scheduler, and worker running locally.
 *
 * Usage: pnpm test:integration
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

const API_PORT = process.env.API_PORT ?? '3000';
const BASE = `http://localhost:${API_PORT}`;

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  process.stdout.write('Integration tests (Batch 4–6)\n');

  // Batch 4: health + dashboard + swagger reachable
  const health = await fetch(`${BASE}/health`);
  assert(health.ok, `Health failed: ${health.status}`);
  const healthBody = await health.json();
  assert(
    (healthBody as { db: string }).db === 'connected',
    'DB not connected',
  );
  process.stdout.write('  OK health\n');

  const stats = await request('GET', '/api/dashboard/stats');
  assert(stats.status === 200, `Dashboard stats failed: ${stats.status}`);
  process.stdout.write('  OK dashboard stats\n');

  const docs = await fetch(`${BASE}/docs`);
  assert(docs.ok, `Swagger UI failed: ${docs.status}`);
  process.stdout.write('  OK swagger /docs\n');

  // Create job (Batch 4 + 5)
  const created = await request('POST', '/api/jobs', {
    type: 'send_email',
    priority: 1,
    payload: { to: 'integration@test.com', subject: 'Batch test' },
  });
  assert(created.status === 201, `Create job failed: ${created.status}`);
  const jobId = (created.data as { id: string }).id;
  process.stdout.write(`  OK create job ${jobId}\n`);

  // Wait for worker to process
  let finalStatus = 'pending';
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const detail = await request('GET', `/api/jobs/${jobId}`);
    finalStatus = (detail.data as { status: string }).status;
    if (finalStatus === 'completed' || finalStatus === 'failed') break;
  }
  assert(
    finalStatus === 'completed',
    `Job did not complete (status: ${finalStatus})`,
  );
  process.stdout.write('  OK job processed end-to-end\n');

  // Create job with dependency (Batch 4)
  const parent = await request('POST', '/api/jobs', {
    type: 'send_email',
    priority: 2,
    payload: { to: 'parent@test.com', subject: 'Parent' },
  });
  assert(parent.status === 201, `Parent job failed: ${parent.status}`);
  const child = await request('POST', '/api/jobs', {
    type: 'send_email',
    priority: 2,
    payload: { to: 'child@test.com', subject: 'Child' },
    depends_on: [(parent.data as { id: string }).id],
  });
  assert(child.status === 201, `Child job with dependency failed: ${child.status}`);
  process.stdout.write('  OK create job with dependency\n');

  // Invalid dependency returns 400
  const badDep = await request('POST', '/api/jobs', {
    type: 'send_email',
    priority: 2,
    payload: { to: 'bad@test.com', subject: 'Bad' },
    depends_on: ['00000000-0000-0000-0000-000000000000'],
  });
  assert(badDep.status === 400, `Expected 400 for missing dependency, got ${badDep.status}`);
  process.stdout.write('  OK invalid dependency rejected\n');

  // Batch 6: SSE receives event on job create
  let sseJobId = '';
  const sseReceived = await (async (): Promise<boolean> => {
    const timeoutMs = 8000;
    const res = await fetch(`${BASE}/api/events`);
    const reader = res.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let buffer = '';
    let matched = false;

    const readUntilMatch = async (): Promise<void> => {
      while (!matched) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (const line of buffer.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as { jobId?: string };
            if (parsed.jobId === sseJobId) {
              matched = true;
              await reader.cancel();
              return;
            }
          } catch {
            // ignore malformed SSE payloads
          }
        }
      }
    };

    const readPromise = readUntilMatch();
    await new Promise((r) => setTimeout(r, 300));

    const sseJob = await request('POST', '/api/jobs', {
      type: 'send_email',
      priority: 3,
      payload: { to: 'sse@test.com', subject: 'SSE test' },
    });
    sseJobId = (sseJob.data as { id: string }).id;

    await Promise.race([
      readPromise,
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);

    return matched;
  })();
  assert(sseReceived, 'SSE did not receive job event within 5s');
  process.stdout.write('  OK SSE event received\n');

  process.stdout.write('PASS: Batch 4–6 integration tests\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
