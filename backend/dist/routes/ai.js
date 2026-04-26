"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middleware/requireAuth");
const groq_1 = require("../services/groq");
const router = (0, express_1.Router)();
router.post('/classify', requireAuth_1.requireAuth, async (req, res) => {
    try {
        const result = await (0, groq_1.classifyWithGroq)(req.body.input || '');
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
});
router.post('/chat', requireAuth_1.requireAuth, async (req, res) => {
    try {
        const reply = await (0, groq_1.chatWithGroq)(req.body.prompt || '', req.body.context || '');
        res.json({ reply });
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
});
router.post('/suggest', requireAuth_1.requireAuth, async (req, res) => {
    try {
        const suggestions = await (0, groq_1.suggestWithGroq)(req.body.prompt || '', req.body.context || '');
        res.json({ suggestions });
    }
    catch (e) {
        console.warn('[ai/suggest]', e);
        res.json({ suggestions: [] });
    }
});
router.post('/merge', requireAuth_1.requireAuth, async (req, res) => {
    try {
        const merged = await (0, groq_1.mergeWithGroq)(req.body.a || '', req.body.b || '');
        res.json({ merged });
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
});
router.post('/find', requireAuth_1.requireAuth, async (req, res) => {
    try {
        const nodeId = await (0, groq_1.findWithGroq)(req.body.query || '', req.body.nodes || []);
        res.json({ nodeId });
    }
    catch (_) {
        res.json({ nodeId: null });
    }
});
router.post('/brainstorm', requireAuth_1.requireAuth, async (req, res) => {
    try {
        const nodes = await (0, groq_1.brainstormWithGroq)(req.body.topic || '');
        res.json({ nodes });
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
});
exports.default = router;
