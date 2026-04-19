"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyWithGroq = classifyWithGroq;
exports.chatWithGroq = chatWithGroq;
exports.suggestWithGroq = suggestWithGroq;
exports.mergeWithGroq = mergeWithGroq;
exports.findWithGroq = findWithGroq;
exports.brainstormWithGroq = brainstormWithGroq;
const axios_1 = __importDefault(require("axios"));
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
async function callGroq(messages) {
    const response = await axios_1.default.post(GROQ_URL, { model: GROQ_MODEL, messages }, {
        headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        timeout: 60000,
    });
    return response.data.choices[0].message.content;
}
async function classifyWithGroq(userInput) {
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const sys = `Classify a message. Time: ${now}.\nReturn ONLY JSON. Types: timer(+seconds), ai_command(+command), question, text.\nExamples: {"type":"timer","seconds":180} | {"type":"question"} | {"type":"text"}`;
    const raw = await callGroq([
        { role: 'system', content: sys },
        { role: 'user', content: userInput },
    ]);
    try {
        const d = JSON.parse(raw);
        if (typeof d === 'object' && d !== null && 'type' in d)
            return d;
    }
    catch (_) { }
    return { type: 'question' };
}
async function chatWithGroq(prompt, context) {
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const sys = `Concise assistant. Time: ${now}.\n1-3 sentences unless asked for more. Don't mention nodes/graphs/context/internal structure.`;
    const msgs = [{ role: 'system', content: sys }];
    if (context)
        msgs.push({ role: 'user', content: 'Context:\n' + context });
    msgs.push({ role: 'user', content: prompt });
    return callGroq(msgs);
}
async function suggestWithGroq(prompt, context) {
    const sys = 'Generate 3 follow-up suggestions. Return ONLY JSON: {"suggestions":["...","...","..."]}. No nodes/graphs.';
    const msgs = [{ role: 'system', content: sys }];
    if (context)
        msgs.push({ role: 'user', content: 'Context:\n' + context });
    msgs.push({ role: 'user', content: prompt });
    const raw = await callGroq(msgs);
    try {
        const d = JSON.parse(raw);
        if (typeof d === 'object' && d !== null && 'suggestions' in d)
            return d.suggestions;
    }
    catch (_) { }
    return [];
}
async function mergeWithGroq(a, b) {
    return callGroq([
        { role: 'system', content: "Merge two texts into one concise clean version. Don't mention merging." },
        { role: 'user', content: 'Text A:\n' + a },
        { role: 'user', content: 'Text B:\n' + b },
    ]);
}
async function findWithGroq(query, nodeDescs) {
    const sys = 'Graph search: find the single most relevant node. Return ONLY JSON: {"nodeId":<int>} or {"nodeId":null}.';
    const raw = await callGroq([
        { role: 'system', content: sys },
        { role: 'user', content: `Query: ${query}\n\nNodes:\n${JSON.stringify(nodeDescs)}` },
    ]);
    try {
        const clean = raw.trim().replace(/```json|```/g, '').trim();
        const d = JSON.parse(clean);
        if (typeof d === 'object' && d !== null && 'nodeId' in d)
            return d.nodeId;
    }
    catch (_) { }
    return null;
}
async function brainstormWithGroq(topic) {
    const sys = 'You are a brainstorm assistant. Analyze the topic and branch out conceptually. Generate necessary, highly related subtopics. The number of subtopics should fit the complexity of the topic (between 2 and 8). Return ONLY a valid JSON array of strings. Do not include markdown formatting. Example output: ["Subtopic A", "Subtopic B", "Subtopic C"]';
    const raw = await callGroq([
        { role: 'system', content: sys },
        { role: 'user', content: topic },
    ]);
    try {
        const clean = raw.trim().replace(/```json|```/g, '').trim();
        const result = JSON.parse(clean);
        if (Array.isArray(result))
            return result;
    }
    catch (_) { }
    return [`${topic} idea 1`, `${topic} idea 2`, `${topic} idea 3`];
}
