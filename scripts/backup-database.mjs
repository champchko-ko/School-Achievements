// scripts/backup-database.mjs
// Usage: node scripts/backup-database.mjs [PIN] [BASE_URL]
// Example: node scripts/backup-database.mjs 1234 https://school-achievements-six.vercel.app

import fs from 'fs';
import path from 'path';

const PIN = process.argv[2] || process.env.ADMIN_PIN;
const BASE_URL = (process.argv[3] || process.env.NEXT_PUBLIC_APP_URL || 'https://school-achievements-six.vercel.app').replace(/\/$/, '');

if (!PIN) {
  console.error('\n❌ Error: Admin PIN is required.');
  console.log('Usage: node scripts/backup-database.mjs <PIN> [BASE_URL]');
  console.log('Example: node scripts/backup-database.mjs 1234 https://school-achievements-six.vercel.app\n');
  process.exit(1);
}

async function runBackup() {
  console.log(`\n📦 Connecting to ${BASE_URL}...`);

  try {
    // 1. Authenticate with admin PIN to receive admin_session cookie
    console.log('🔑 Authenticating admin session...');
    const authRes = await fetch(`${BASE_URL}/api/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': BASE_URL,
      },
      body: JSON.stringify({ pin: PIN }),
    });

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}));
      throw new Error(`Authentication failed: ${err.error || authRes.statusText}`);
    }

    // Extract admin_session cookie
    const setCookie = authRes.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('No session cookie returned from authentication');
    }

    const sessionCookie = setCookie.split(';')[0];
    console.log('✅ Admin session verified.');

    // 2. Request database backup
    console.log('📥 Exporting database collections (achievements, settings, admin, logs)...');
    const backupRes = await fetch(`${BASE_URL}/api/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'Origin': BASE_URL,
      },
      body: JSON.stringify({ action: 'download' }),
    });

    if (!backupRes.ok) {
      const err = await backupRes.json().catch(() => ({}));
      throw new Error(`Backup failed: ${err.error || backupRes.statusText}`);
    }

    const backupData = await backupRes.json();

    // 3. Save backup JSON to local backups/ directory
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `school-achievements-backup-${timestamp}.json`;
    const targetPath = path.join(backupsDir, filename);

    fs.writeFileSync(targetPath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log(`\n🎉 Success! Database backup saved to:`);
    console.log(`   📂 ${targetPath}`);
    console.log(`   📊 Total collections: ${backupData.collections?.length || 0}`);
    console.log(`   📄 Total documents:   ${backupData.totalDocuments || 0}`);
    console.log(`   🕒 Created at:        ${backupData.createdAt}\n`);

  } catch (error) {
    console.error(`\n❌ Backup failed: ${error.message}\n`);
    process.exit(1);
  }
}

runBackup();
