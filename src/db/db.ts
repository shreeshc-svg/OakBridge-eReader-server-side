import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { dbConfig } from '../config/app.config';

const { Pool } = pg;

const pool = new Pool({
     connectionString: dbConfig.db as string,
     max: 100,
     min: 0,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 15000,
     ssl: dbConfig.db?.includes('sslmode=disable')
          ? false
          : dbConfig.db?.includes('neon.tech')
            ? { rejectUnauthorized: false }
            : undefined,
});

pool.on('error', (err) => {
     console.error(
          '[DB] Idle client error (connection will be replaced):',
          err.message
     );
});

export const db = drizzle(pool);
