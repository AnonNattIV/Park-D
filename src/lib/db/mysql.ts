import mysql from 'mysql2';
import type { Pool as PromisePool } from 'mysql2/promise';

let pool: PromisePool | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export default function getPool(): PromisePool {
  if (!pool) {
    const useSsl = process.env.DB_SSL !== 'false';

    const basePool = mysql.createPool({
      host: getRequiredEnv('DB_HOST'),
      port: Number(process.env.DB_PORT || 3306),
      user: getRequiredEnv('DB_USER'),
      password: getRequiredEnv('DB_PASSWORD'),
      database: getRequiredEnv('DB_NAME'),
      timezone: '+07:00',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    // Ensure every new DB session uses Bangkok timezone so NOW()/CURRENT_TIMESTAMP are Thai time.
    basePool.on('connection', (connection) => {
      connection.query("SET time_zone = '+07:00'");
    });

    pool = basePool.promise();
  }

  return pool;
}
