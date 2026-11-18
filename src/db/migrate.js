import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../../migrations');

// Every migration up to and including this one was already applied to the
// existing databases before migration tracking existed. On a database that
// already has the app's tables but no schema_migrations table yet, these
// are recorded as applied WITHOUT being run. Several of them are NOT safe
// to re-run on real data — 008 renumbers every QR's extension code and 009
// resets the code sequences.
const BASELINE_UPTO = '025';

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }
  const isSupabase = /supabase\.(co|com)/i.test(databaseUrl);
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    const allFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // ── Tracking table + one-time baseline ─────────────────────────────
    const hadTracking = (await client.query(
      `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`
    )).rows[0].ok;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    if (!hadTracking) {
      const existingDb = (await client.query(
        `SELECT to_regclass('public.qrdata') IS NOT NULL AS ok`
      )).rows[0].ok;
      if (existingDb) {
        const baseline = allFiles.filter((f) => f.slice(0, 3) <= BASELINE_UPTO);
        for (const f of baseline) {
          await client.query(
            `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
            [f]
          );
        }
        console.log(
          `Existing database: recorded ${baseline.length} earlier migrations ` +
          `(001–${BASELINE_UPTO}) as already applied, without running them.`
        );
      }
    }

    const applied = new Set(
      (await client.query(`SELECT filename FROM schema_migrations`)).rows.map((r) => r.filename)
    );

    // Optional: `npm run migrate -- 026` runs only files starting with 026.
    // An already-applied file is still skipped unless --force is given.
    const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
    const force = process.argv.includes('--force');
    let files = allFiles;
    if (filter) {
      files = allFiles.filter((f) => f.startsWith(filter));
      if (files.length === 0) {
        console.error(`No migration file starts with "${filter}"`);
        process.exit(1);
      }
    }

    const pending = files.filter((f) => force || !applied.has(f));
    if (pending.length === 0) {
      console.log('Nothing to run — database is up to date.');
      await ensureRls(client);
      return;
    }

    // Each file runs in its own transaction and is recorded in the same
    // transaction, so a failing file leaves no partial changes and is
    // retried next time; files after it are not run.
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log('Running', file);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)
           ON CONFLICT (filename) DO UPDATE SET applied_at = NOW()`,
          [file]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`\n${file} FAILED — rolled back, nothing from it was applied. Later files were not run.`);
        throw e;
      }
    }
    console.log('Migrations complete.');
    await ensureRls(client);
  } finally {
    await client.end();
  }
}

// Supabase exposes every `public` table through its REST API; a table with
// Row-Level Security off is readable and writable by anyone holding the
// public anon key. The app never uses that API (the backend connects as
// `postgres`, which bypasses RLS), so every table must have RLS on — this
// switches it on for any table a migration just created. See 027.
async function ensureRls(client) {
  const open = (await client.query(`
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND NOT c.relrowsecurity`)).rows.map((r) => r.relname);
  for (const t of open) {
    await client.query(`ALTER TABLE public."${t.replace(/"/g, '""')}" ENABLE ROW LEVEL SECURITY`);
  }
  if (open.length) {
    console.log(`Row-Level Security switched on for: ${open.join(', ')}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
