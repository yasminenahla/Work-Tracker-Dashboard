// Shared Postgres pool for API routes. Leading underscore keeps Vercel from
// treating this as a route (it only maps files without a leading "_" under
// /api to endpoints). One small pool per lambda instance — use the Neon
// *pooled* connection string (see .env.example) so this plays nicely with
// serverless's many-short-lived-instances model.
import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new pg.Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      ssl: connectionString.includes('sslmode=') ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
