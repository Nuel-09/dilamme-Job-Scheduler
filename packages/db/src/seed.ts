import './load-env.js';
import { createJob, getDb } from './index.js';
import { closeDb } from './client.js';

async function seed() {
  getDb();
  console.log('Seeding DAG workflow: generate_report → upload_file → send_email');

  const reportJob = await createJob({
    type: 'generate_report',
    priority: 2,
    payload: { reportType: 'monthly_sales', format: 'pdf' },
  });

  const uploadJob = await createJob({
    type: 'upload_file',
    priority: 2,
    payload: { destination: 's3://reports/monthly.pdf' },
    dependsOn: [reportJob.id],
  });

  const emailJob = await createJob({
    type: 'send_email',
    priority: 1,
    payload: {
      to: 'test@gmail.com',
      subject: 'Your monthly report is ready',
      body: 'The report has been generated and uploaded.',
    },
    dependsOn: [uploadJob.id],
  });

  await createJob({
    type: 'send_email',
    priority: 3,
    payload: { to: 'demo@gmail.com', subject: 'Welcome', body: 'Low priority demo job' },
  });

  await createJob({
    type: 'send_email',
    priority: 1,
    payload: { to: 'scheduled@gmail.com', subject: 'Scheduled', body: 'Runs in 2 minutes' },
    scheduledAt: new Date(Date.now() + 2 * 60_000),
  });

  console.log('Seed complete:');
  console.log(`  generate_report: ${reportJob.id}`);
  console.log(`  upload_file:     ${uploadJob.id}`);
  console.log(`  send_email:      ${emailJob.id}`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => closeDb());
