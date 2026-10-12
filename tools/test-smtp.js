const Database = require('better-sqlite3');

async function main() {
  const db = new Database('/app/database/MacOS.db');
  const { EmailReminderScheduler } = require('/app/backend/departments/billing/services/email-reminder-scheduler');
  const scheduler = new EmailReminderScheduler(db);

  console.log('--- Testing Test SMTP ---');
  const testRes = await scheduler.testSmtp();
  console.log('testSmtp:', testRes);

  console.log('\n--- Testing Daily Summary ---');
  const dailyRes = await scheduler.triggerDaily();
  console.log('triggerDaily:', dailyRes);

  console.log('\n--- Testing Weekly Summary ---');
  const weeklyRes = await scheduler.triggerWeekly();
  console.log('triggerWeekly:', weeklyRes);

  console.log('\n--- Testing Invoice Overdue (7d) ---');
  const invRes = await scheduler.triggerInvoiceOverdue(7);
  console.log('triggerInvoiceOverdue(7):', invRes);

  console.log('\n--- Testing Order Pending (1d) ---');
  const ordRes = await scheduler.triggerOrderPending(1);
  console.log('triggerOrderPending(1):', ordRes);
}

main().catch(console.error);
