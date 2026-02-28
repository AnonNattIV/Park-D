import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export default function getPool(): mysql.Pool {
  if (!pool) {
    const useSsl = process.env.DB_SSL !== 'false';

    pool = mysql.createPool({
      host: getRequiredEnv('DB_HOST'),
      port: Number(process.env.DB_PORT || 3306),
      user: getRequiredEnv('DB_USER'),
      password: getRequiredEnv('DB_PASSWORD'),
      database: getRequiredEnv('DB_NAME'),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}
