import { defineConfig } from 'drizzle-kit';
import { dbConfig } from './app.config';

const db_url = dbConfig.db;

if (!db_url) {
     throw new Error('Database URL is not defined');
}

export default defineConfig({
     schema: './src/db/schema.ts',
     out: './drizzle',
     dialect: 'postgresql',
     dbCredentials: {
          url: db_url,
     },
});
