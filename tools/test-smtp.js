const Database = require('better-sqlite3');

async function main() {
  const db = new Database('/app/database/MacOS.db');
  const { EmailReminderScheduler } = require('/app/backend/departments/billing/services/email-reminder-scheduler');

  console.log('--- Current Email Settings in DB ---');
  const rows = db.prepare("SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'email_%'").all();
  for (const r of rows) {
    console.log(`  ${r.setting_key}: ${r.setting_value}`);
  }

  // Update email_smtp_host to mail.faizal.uk if it is 127.0.0.1
  const hostRow = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'email_smtp_host'").get();
  if (hostRow && hostRow.setting_value === '127.0.0.1') {
    console.log('\nUpdating email_smtp_host in DB from 127.0.0.1 to mail.faizal.uk...');
    db.prepare("UPDATE app_settings SET setting_value = 'mail.faizal.uk' WHERE setting_key = 'email_smtp_host'").run();
    console.log('Updated.');
  }

  console.log('\n--- Running testSmtp() via EmailReminderScheduler ---');
  const scheduler = new EmailReminderScheduler(db);
  const result = await scheduler.testSmtp();
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
