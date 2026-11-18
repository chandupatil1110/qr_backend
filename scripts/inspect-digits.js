// READ-ONLY check of QR extension codes after the accidental re-run of
// migration 008 (which renumbers every qrdata.digits to 0001, 0002, ...).
// Prints only ids, codes, flags and dates — no names or phone numbers.
// Usage:  node scripts/inspect-digits.js
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase.(co|com)/i.test(process.env.DATABASE_URL || '')
    ? { rejectUnauthorized: false }
    : false,
});
await c.connect();
await c.query('BEGIN READ ONLY');
const q = async (sql) => (await c.query(sql)).rows;

console.log('\n== qrdata (oldest first) ==');
console.table(await q(`
  SELECT id, digits, is_manual, created_at::date AS created
    FROM qrdata ORDER BY created_at, id`));

console.log('\n== activated stickers: printed code vs current QR code ==');
console.table(await q(`
  SELECT q.id AS qr_id, mq.digits AS printed_code, q.digits AS current_code
    FROM manual_qr mq
    JOIN qrdata q ON q.unique_id = mq.qr_unique_id
   ORDER BY q.id`));

console.log('\n== digit sequences ==');
console.table(await q(`
  SELECT sequencename, min_value, max_value, last_value
    FROM pg_sequences WHERE sequencename LIKE 'qrdata_digits%'`));

await c.query('ROLLBACK');
await c.end();
