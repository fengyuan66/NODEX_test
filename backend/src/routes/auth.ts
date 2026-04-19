import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool';

const router = Router();
const SALT_ROUNDS = 10;

// POST /auth/signup
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  const { email, password, remember } = req.body;
  if (!email || !password) {
    res.json({ error: 'Email and password required.' });
    return;
  }
  if (password.length < 6) {
    res.json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.trim().toLowerCase(), hash]
    );
    const userId = result.rows[0].id as number;
    req.session.userId = userId;
    req.session.email = email.trim().toLowerCase();
    if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    const nextUrl = req.session.nextUrl || '/';
    delete req.session.nextUrl;
    res.json({ ok: true, next_url: nextUrl });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      res.json({ error: 'Email already registered.' });
    } else {
      res.status(500).json({ error: 'Server error.' });
    }
  } finally {
    client.release();
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password, remember } = req.body;
  if (!email || !password) {
    res.json({ error: 'Email and password required.' });
    return;
  }
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE email=$1', [
      email.trim().toLowerCase(),
    ]);
    const user = result.rows[0];
    if (!user) {
      res.json({ error: 'Invalid email or password.' });
      return;
    }
    const match = await bcrypt.compare(password, user.password_hash as string);
    if (!match) {
      res.json({ error: 'Invalid email or password.' });
      return;
    }
    req.session.userId = user.id as number;
    req.session.email = user.email as string;
    if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    const nextUrl = req.session.nextUrl || '/';
    delete req.session.nextUrl;
    res.json({ ok: true, next_url: nextUrl });
  } finally {
    client.release();
  }
});

// GET /auth/logout
router.get('/logout', (req: Request, res: Response): void => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /auth/me
router.get('/me', (req: Request, res: Response): void => {
  if (!req.session.userId) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, email: req.session.email });
});

export default router;
