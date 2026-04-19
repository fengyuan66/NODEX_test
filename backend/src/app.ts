import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';

import authRouter from './routes/auth';
import graphRouter from './routes/graph';
import aiRouter from './routes/ai';
import settingsRouter from './routes/settings';

dotenv.config();

const app = express();

// CORS — allow Vite dev server
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:4000'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'nodex_dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 1 day default, extended on "remember me"
  },
}));

// Routes
app.use('/auth', authRouter);
app.use('/', graphRouter);
app.use('/', aiRouter);
app.use('/', settingsRouter);

export default app;
