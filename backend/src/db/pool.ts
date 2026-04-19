import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS graphs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        data TEXT NOT NULL DEFAULT '{}',
        share_id TEXT UNIQUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS graph_collaborators (
        graph_id INTEGER REFERENCES graphs(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (graph_id, user_id)
      );
    `);

    // Add share_id column if it doesn't exist (migration safety)
    try {
      await client.query(`ALTER TABLE graphs ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;`);
    } catch (_) {
      // Already exists — ignore
    }

    console.log('✅ Database schema ready');
  } finally {
    client.release();
  }
}
