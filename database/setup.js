require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const TARGET_DB = process.env.DB_NAME || 'SOI-2026-2610-0035-mizyana';
const MIGRATION_FILE = path.join(__dirname, 'migrate_to_new_schema.sql');
const STABILIZE_FILE = path.join(__dirname, 'stabilize_schema_alignment.sql');
const PROMOTION_APPROVAL_FILE = path.join(__dirname, 'add_promotion_approval_fields.sql');
const PASSWORD_RESET_FILE = path.join(__dirname, 'add_password_reset_tokens.sql');
const LOGIN_2FA_FILE = path.join(__dirname, 'add_login_2fa_tokens.sql');
const EMAIL_NOTIFICATION_FILE = path.join(__dirname, 'add_email_notification_support.sql');
const EMAIL_VERIFICATION_FILE = path.join(__dirname, 'add_email_verification.sql');
const RESCHEDULED_BOOKING_STATUS_FILE = path.join(__dirname, 'add_rescheduled_booking_status.sql');
const VOUCHER_CHECKOUT_FILE = path.join(__dirname, 'add_voucher_checkout_fields.sql');
const IN_APP_NOTIFICATIONS_FILE = path.join(__dirname, 'add_in_app_notifications.sql');
const PAYMENT_WALLET_FILE = path.join(__dirname, 'add_payment_wallet.sql');
const CONSOLIDATE_SCHEMA_FILE = path.join(__dirname, 'consolidate_schema.sql');

function currentSchemaSql() {
  const migration = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const schemaOnly = migration.split('-- STEP 3: Migrate data from old database')[0];

  return schemaOnly.replace(
    /`SOI-2026-2610-0035-mizyana`/g,
    `\`${TARGET_DB}\``
  );
}

async function setup() {
  // connect WITHOUT specifying a database first
  const conn = await mysql.createConnection({
    host:             process.env.DB_HOST     || 'localhost',
    user:             process.env.DB_USER     || 'root',
    password:         process.env.DB_PASSWORD || '',
    port:             process.env.DB_PORT     || 3306,
    multipleStatements: true,
  });

  console.log('Connected to MySQL.');

  await conn.query(currentSchemaSql());

  console.log(`Schema executed successfully for ${TARGET_DB}.`);

  await conn.query(`USE \`${TARGET_DB}\``);

  const stabilizeSql = fs.readFileSync(STABILIZE_FILE, 'utf8');
  await conn.query(stabilizeSql);
  const promotionApprovalSql = fs.readFileSync(PROMOTION_APPROVAL_FILE, 'utf8');
  await conn.query(promotionApprovalSql);
  const passwordResetSql = fs.readFileSync(PASSWORD_RESET_FILE, 'utf8');
  await conn.query(passwordResetSql);
  const login2faSql = fs.readFileSync(LOGIN_2FA_FILE, 'utf8');
  await conn.query(login2faSql);
  const emailNotificationSql = fs.readFileSync(EMAIL_NOTIFICATION_FILE, 'utf8');
  await conn.query(emailNotificationSql);
  const emailVerificationSql = fs.readFileSync(EMAIL_VERIFICATION_FILE, 'utf8');
  await conn.query(emailVerificationSql);
  const rescheduledBookingStatusSql = fs.readFileSync(RESCHEDULED_BOOKING_STATUS_FILE, 'utf8');
  await conn.query(rescheduledBookingStatusSql);
  const voucherCheckoutSql = fs.readFileSync(VOUCHER_CHECKOUT_FILE, 'utf8');
  await conn.query(voucherCheckoutSql);
  const inAppNotificationsSql = fs.readFileSync(IN_APP_NOTIFICATIONS_FILE, 'utf8');
  await conn.query(inAppNotificationsSql);
  const paymentWalletSql = fs.readFileSync(PAYMENT_WALLET_FILE, 'utf8');
  await conn.query(paymentWalletSql);
  const consolidateSchemaSql = fs.readFileSync(CONSOLIDATE_SCHEMA_FILE, 'utf8');
  await conn.query(consolidateSchemaSql);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('Stabilization migrations executed successfully.');

  // verify
  const [tables] = await conn.query('SHOW TABLES');
  console.log('\nTables created:');
  tables.forEach(t => console.log(' -', Object.values(t)[0]));

  await conn.end();
}

setup().catch(err => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
