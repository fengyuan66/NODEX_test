import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// GET /load — personal graph
router.get('/load', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT data FROM graphs WHERE user_id=$1', [req.session.userId]);
    if (!result.rows[0]) { res.status(404).json({}); return; }
    res.json(JSON.parse(result.rows[0].data as string));
  } catch (_) {
    res.status(500).json({});
  } finally {
    client.release();
  }
});

// POST /save — upsert personal graph
router.post('/save', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const data = JSON.stringify(req.body);
    const existing = await client.query('SELECT id FROM graphs WHERE user_id=$1', [req.session.userId]);
    if (existing.rows[0]) {
      await client.query('UPDATE graphs SET data=$1, updated_at=NOW() WHERE user_id=$2', [data, req.session.userId]);
    } else {
      await client.query('INSERT INTO graphs (user_id, data) VALUES ($1, $2)', [req.session.userId, data]);
    }
    res.json({ ok: true });
  } catch (_) {
    res.status(500).json({ error: 'Save failed.' });
  } finally {
    client.release();
  }
});

// GET /load_shared/:shareId
router.get('/load_shared/:shareId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT data FROM graphs WHERE share_id=$1', [req.params.shareId]);
    if (!result.rows[0]) { res.status(404).json({}); return; }
    res.json(JSON.parse(result.rows[0].data as string));
  } catch (_) {
    res.status(500).json({});
  } finally {
    client.release();
  }
});

// POST /share/create
router.post('/share/create', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT share_id FROM graphs WHERE user_id=$1', [req.session.userId]);
    const row = result.rows[0];
    if (row?.share_id) {
      res.json({ share_id: row.share_id });
      return;
    }
    const shareId = uuidv4();
    const updated = await client.query(
      'UPDATE graphs SET share_id=$1 WHERE user_id=$2 RETURNING id',
      [shareId, req.session.userId]
    );
    if (updated.rowCount === 0) {
      await client.query('INSERT INTO graphs (user_id, data, share_id) VALUES ($1, $2, $3)', [
        req.session.userId, '{}', shareId,
      ]);
    }
    res.json({ share_id: shareId });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// POST /share/invite
router.post('/share/invite', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { email, share_id } = req.body as { email: string; share_id: string };
  const client = await pool.connect();
  try {
    const userRes = await client.query('SELECT id FROM users WHERE email=$1', [email.trim().toLowerCase()]);
    if (!userRes.rows[0]) { res.json({ error: 'User not found. Ask them to sign up first!' }); return; }
    const graphRes = await client.query('SELECT id FROM graphs WHERE share_id=$1', [share_id]);
    if (!graphRes.rows[0]) { res.json({ error: 'Graph not found.' }); return; }
    await client.query(
      'INSERT INTO graph_collaborators (graph_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [graphRes.rows[0].id, userRes.rows[0].id]
    );
    res.json({ ok: true });
  } catch (_) {
    res.status(500).json({ error: 'Database error.' });
  } finally {
    client.release();
  }
});

// GET /api/dashboard
router.get('/api/dashboard', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT g.share_id, gc.added_at, g.updated_at, u.email as owner_email
      FROM graph_collaborators gc
      JOIN graphs g ON gc.graph_id = g.id
      JOIN users u ON g.user_id = u.id
      WHERE gc.user_id = $1
    `, [req.session.userId]);
    const shared = result.rows.map(r => ({
      ...r,
      added_at: r.added_at?.toISOString(),
      updated_at: r.updated_at?.toISOString(),
    }));
    res.json({ shared_with_me: shared });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// GET /api/collaborators/:shareId
router.get('/api/collaborators/:shareId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT u.email FROM graph_collaborators gc
      JOIN graphs g ON gc.graph_id = g.id
      JOIN users u ON gc.user_id = u.id
      WHERE g.share_id = $1
    `, [req.params.shareId]);
    res.json({ collaborators: result.rows });
  } finally {
    client.release();
  }
});

export default router;
