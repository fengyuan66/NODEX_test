import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  classifyWithGroq,
  chatWithGroq,
  suggestWithGroq,
  mergeWithGroq,
  findWithGroq,
  brainstormWithGroq,
} from '../services/groq';

const router = Router();

router.post('/classify', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await classifyWithGroq(req.body.input || '');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/chat', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const reply = await chatWithGroq(req.body.prompt || '', req.body.context || '');
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/suggest', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const suggestions = await suggestWithGroq(req.body.prompt || '', req.body.context || '');
    res.json({ suggestions });
  } catch (e) {
    console.warn('[ai/suggest]', e);
    res.json({ suggestions: [] });
  }
});

router.post('/merge', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const merged = await mergeWithGroq(req.body.a || '', req.body.b || '');
    res.json({ merged });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/find', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const nodeId = await findWithGroq(req.body.query || '', req.body.nodes || []);
    res.json({ nodeId });
  } catch (_) {
    res.json({ nodeId: null });
  }
});

router.post('/brainstorm', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const nodes = await brainstormWithGroq(req.body.topic || '');
    res.json({ nodes });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
