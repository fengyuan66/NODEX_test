"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const pool_1 = require("../db/pool");
const router = (0, express_1.Router)();
const SALT_ROUNDS = 10;
// POST /auth/signup
router.post('/signup', async (req, res) => {
    const { email, password, remember } = req.body;
    if (!email || !password) {
        res.json({ error: 'Email and password required.' });
        return;
    }
    if (password.length < 6) {
        res.json({ error: 'Password must be at least 6 characters.' });
        return;
    }
    const client = await pool_1.pool.connect();
    try {
        const hash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
        const result = await client.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [email.trim().toLowerCase(), hash]);
        const userId = result.rows[0].id;
        req.session.userId = userId;
        req.session.email = email.trim().toLowerCase();
        if (remember)
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        const nextUrl = req.session.nextUrl || '/';
        delete req.session.nextUrl;
        res.json({ ok: true, next_url: nextUrl });
    }
    catch (err) {
        const pg = err;
        if (pg.code === '23505') {
            res.json({ error: 'Email already registered.' });
        }
        else {
            res.status(500).json({ error: 'Server error.' });
        }
    }
    finally {
        client.release();
    }
});
// POST /auth/login
router.post('/login', async (req, res) => {
    const { email, password, remember } = req.body;
    if (!email || !password) {
        res.json({ error: 'Email and password required.' });
        return;
    }
    const client = await pool_1.pool.connect();
    try {
        const result = await client.query('SELECT * FROM users WHERE email=$1', [
            email.trim().toLowerCase(),
        ]);
        const user = result.rows[0];
        if (!user) {
            res.json({ error: 'Invalid email or password.' });
            return;
        }
        const match = await bcrypt_1.default.compare(password, user.password_hash);
        if (!match) {
            res.json({ error: 'Invalid email or password.' });
            return;
        }
        req.session.userId = user.id;
        req.session.email = user.email;
        if (remember)
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        const nextUrl = req.session.nextUrl || '/';
        delete req.session.nextUrl;
        res.json({ ok: true, next_url: nextUrl });
    }
    finally {
        client.release();
    }
});
// GET /auth/logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});
// GET /auth/me
router.get('/me', (req, res) => {
    if (!req.session.userId) {
        res.json({ authenticated: false });
        return;
    }
    res.json({ authenticated: true, email: req.session.email });
});
exports.default = router;
