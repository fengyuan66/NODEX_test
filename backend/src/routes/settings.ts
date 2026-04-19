import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/save_settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const uid = req.session.userId!;
    const settings = JSON.stringify(req.body);
    const existing = await client.query('SELECT user_id FROM user_settings WHERE user_id=$1', [uid]);
    if (existing.rows[0]) {
      await client.query('UPDATE user_settings SET settings=$1 WHERE user_id=$2', [settings, uid]);
    } else {
      await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)', [uid, settings]);
    }
    res.json({ ok: true });
  } catch (_) {
    res.status(500).json({ error: 'Failed to save settings.' });
  } finally {
    client.release();
  }
});

router.get('/load_settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT settings FROM user_settings WHERE user_id=$1', [req.session.userId]);
    if (!result.rows[0]) { res.status(404).json({}); return; }
    res.json(result.rows[0].settings);
  } finally {
    client.release();
  }
});

export default router;
