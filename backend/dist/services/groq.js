"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGroqApiKey = getGroqApiKey;
exports.classifyWithGroq = classifyWithGroq;
exports.chatWithGroq = chatWithGroq;
exports.suggestWithGroq = suggestWithGroq;
exports.mergeWithGroq = mergeWithGroq;
exports.findWithGroq = findWithGroq;
exports.brainstormWithGroq = brainstormWithGroq;
const axios_1 = __importStar(require("axios"));
const webSearch_1 = require("./webSearch");
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_CHAT_MAX_TOKENS = 700;
const DEFAULT_CONTEXT_MAX_CHARS = 3000;
function groqModel() {
    const model = (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
    return model || DEFAULT_GROQ_MODEL;
}
function parseEnvInt(name, fallback, min, max) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, parsed));
}
function clampText(value, maxChars) {
    if (!value)
        return '';
    if (value.length <= maxChars)
        return value;
    return value.slice(0, maxChars);
}
function normalizeSpace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function chatMaxTokens() {
    return parseEnvInt('GROQ_CHAT_MAX_TOKENS', DEFAULT_CHAT_MAX_TOKENS, 128, 2048);
}
function contextMaxChars() {
    return parseEnvInt('CHAT_CONTEXT_MAX_CHARS', DEFAULT_CONTEXT_MAX_CHARS, 500, 12000);
}
function webSearchDeciderMode() {
    const raw = (process.env.WEB_SEARCH_DECIDER || 'hybrid').trim().toLowerCase();
    if (raw === 'model')
        return 'model';
    if (raw === 'heuristic')
        return 'heuristic';
    return 'hybrid';
}
function truthy(raw) {
    if (!raw)
        return false;
    const value = raw.trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
function webSearchDebugEnabled() {
    return truthy(process.env.WEB_SEARCH_DEBUG);
}
function getGroqApiKey() {
    let raw = process.env.GROQ_API_KEY ?? '';
    raw = raw.replace(/^\uFEFF/, '');
    raw = raw.replace(/[\u200B-\u200D\uFEFF]/g, '');
    raw = raw.replace(/\r/g, '');
    raw = raw.trim();
    raw = raw.replace(/^['"]|['"]$/g, '').trim();
    const token = raw.match(/^(gsk_[A-Za-z0-9]+)/);
    if (token)
        return token[1];
    return raw;
}
function requireGroqKey() {
    if (!getGroqApiKey()) {
        throw new Error('GROQ_API_KEY is missing. Add it to backend/.env or the repo-root .env (see backend/.env.example).');
    }
}
function formatGroqFailure(err) {
    if ((0, axios_1.isAxiosError)(err)) {
        const data = err.response?.data;
        const groqMsg = data?.error?.message;
        if (groqMsg)
            return groqMsg;
        const status = err.response?.status;
        if (status)
            return `Groq HTTP ${status}: ${err.message}`;
    }
    if (err instanceof Error)
        return err.message;
    return String(err);
}
function isGroqAuthError(err) {
    if (!(0, axios_1.isAxiosError)(err))
        return false;
    if (err.response?.status === 401)
        return true;
    const msg = err.response?.data?.error?.message ?? '';
    return /invalid\s+api\s*key/i.test(msg);
}
function maskGroqKeyForLog(key) {
    if (!key)
        return '(empty after normalize)';
    if (key.length <= 12)
        return `${key.length} chars, starts with ${JSON.stringify(key.slice(0, 3))}`;
    return `${key.slice(0, 8)}...${key.slice(-4)} (${key.length} chars)`;
}
function logReceivedKeyIfInvalidApiKey(err) {
    if (!isGroqAuthError(err))
        return;
    const key = getGroqApiKey();
    const full = process.env.GROQ_DEBUG_PRINT_FULL_KEY === '1' ||
        process.env.GROQ_DEBUG_PRINT_FULL_KEY === 'true' ||
        process.env.GROQ_DEBUG_PRINT_FULL_KEY === 'yes';
    if (full) {
        console.warn('[groq] Invalid API key - GROQ_API_KEY value as received (remove GROQ_DEBUG_PRINT_FULL_KEY when done):');
        console.warn(key);
        return;
    }
    console.warn('[groq] Invalid API key - GROQ_API_KEY as received (masked). To log full value locally, set GROQ_DEBUG_PRINT_FULL_KEY=1 in .env:');
    console.warn(maskGroqKeyForLog(key));
    console.warn('[groq] Last 8 chars JSON-escaped (spot hidden \\r, spaces, or quotes):', JSON.stringify(key.slice(-8)));
    if (key.length > 53 || key.length < 48) {
        console.warn('[groq] Groq keys are usually about 51 characters after cleanup. If length is off, re-paste the key on one line with no spaces around =.');
    }
}
async function callGroq(messages, options = {}) {
    requireGroqKey();
    const maxTokens = options.maxTokens ?? chatMaxTokens();
    try {
        const response = await axios_1.default.post(GROQ_URL, {
            model: groqModel(),
            messages,
            max_tokens: maxTokens,
        }, {
            headers: {
                Authorization: `Bearer ${getGroqApiKey()}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        });
        const content = response.data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('Groq returned an empty reply.');
        }
        return content;
    }
    catch (err) {
        logReceivedKeyIfInvalidApiKey(err);
        throw new Error(formatGroqFailure(err));
    }
}
function parseJsonFromModel(raw) {
    const clean = raw.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
}
function buildSearchQuery(prompt) {
    let query = normalizeSpace(prompt);
    query = query
        .replace(/\b(include|with|add|provide)\b[^.?!\n]*\b(sources?|citations?|references?|links?|urls?)\b[^.?!\n]*/gi, '')
        .replace(/\b(in|within)\s+\d+\s+(sentence|sentences|bullet|bullets|point|points)\b/gi, '')
        .replace(/\b(briefly|concisely|shortly)\b/gi, '');
    query = normalizeSpace(query);
    return query.slice(0, 240);
}
function heuristicSearchDecision(prompt) {
    const text = normalizeSpace(prompt.toLowerCase());
    if (!text)
        return { shouldSearch: false, query: '' };
    const explicitNoSearchPattern = /\b(no web|don't search|do not search|without (?:web|internet|online) (?:search|lookup)|use only (?:the )?(?:context|canvas|information above)|from (?:the )?(?:context|canvas) only)\b/;
    if (explicitNoSearchPattern.test(text)) {
        return { shouldSearch: false, query: '' };
    }
    const freshnessPattern = /\b(latest|today|current|currently|up[- ]to[- ]date|as of|recent|breaking|just announced|release|released|version|changelog|roadmap|new model)\b/;
    const liveDataPattern = /\b(news|weather|forecast|temperature|stock|price|market|exchange rate|score|standings|schedule|odds|flight|traffic|election|poll|earthquake)\b/;
    const explicitWebPattern = /\b(search|look up|lookup|check online|find online|web|online|internet|source|sources|citation|citations|references?)\b/;
    const factualQuestionPattern = /^(who|what|when|where|why|how|is|are|can|could|did|does|do|which)\b/;
    const creativeOnlyPattern = /\b(write|rewrite|rephrase|proofread|edit|improve wording|summari[sz]e|brainstorm|poem|story|email|cover letter|tweet|caption|title ideas)\b/;
    const evergreenConceptPattern = /\b(explain|definition|define|how to|tutorial|example|examples|syntax|algorithm|difference between|pros and cons)\b/;
    const hasFreshOrExternalSignal = explicitWebPattern.test(text) || freshnessPattern.test(text) || liveDataPattern.test(text);
    let score = 0;
    if (explicitWebPattern.test(text))
        score += 4;
    if (freshnessPattern.test(text))
        score += 3;
    if (liveDataPattern.test(text))
        score += 3;
    if (factualQuestionPattern.test(text))
        score += 2;
    if (/\?\s*$/.test(text))
        score += 1;
    if (!hasFreshOrExternalSignal && evergreenConceptPattern.test(text)) {
        return { shouldSearch: false, query: '' };
    }
    if (creativeOnlyPattern.test(text) && score < 4) {
        return { shouldSearch: false, query: '' };
    }
    const shouldSearch = score >= 3;
    return {
        shouldSearch,
        query: shouldSearch ? buildSearchQuery(prompt) || prompt.slice(0, 240) : '',
    };
}
async function planWebSearch(prompt, context) {
    if (!(0, webSearch_1.isWebSearchEnabled)()) {
        return { shouldSearch: false, query: '' };
    }
    const heuristic = heuristicSearchDecision(prompt);
    const mode = webSearchDeciderMode();
    if (mode === 'heuristic')
        return heuristic;
    const plannerPrompt = 'You decide if a user request needs web search before answering. ' +
        'Search when fresh or external facts are required (news, prices, schedules, versions, releases, current events, stats, or uncertain facts), even if the user did not explicitly ask to search. ' +
        'Do not search for pure writing/editing tasks or when provided context is enough. ' +
        'Return ONLY JSON: {"shouldSearch": true|false, "query": "short search query"}';
    try {
        const raw = await callGroq([
            { role: 'system', content: plannerPrompt },
            { role: 'user', content: context ? `Context:\n${clampText(context, 900)}` : 'Context: (none)' },
            { role: 'user', content: `User request:\n${clampText(prompt, 600)}` },
        ], { maxTokens: 80 });
        const parsed = parseJsonFromModel(raw);
        if (typeof parsed !== 'object' || parsed === null)
            return heuristic;
        const record = parsed;
        const shouldSearch = Boolean(record.shouldSearch);
        const query = typeof record.query === 'string'
            ? normalizeSpace(record.query).slice(0, 320)
            : buildSearchQuery(prompt);
        const modelPlan = {
            shouldSearch,
            query: shouldSearch ? query || buildSearchQuery(prompt) || prompt.slice(0, 240) : '',
        };
        if (mode === 'model')
            return modelPlan;
        if (modelPlan.shouldSearch || !heuristic.shouldSearch)
            return modelPlan;
        return heuristic;
    }
    catch {
        return heuristic;
    }
}
function formatSearchResults(results) {
    return results
        .map((result, index) => {
        const rank = index + 1;
        const snippet = result.snippet || '(No snippet available)';
        return `[${rank}] ${result.title}\nURL: ${result.url}\nSnippet: ${snippet}`;
    })
        .join('\n\n');
}
function normalizeSourceCitations(reply) {
    if (!reply)
        return reply;
    // Keep citation label consistent and avoid raw URL dumps in the UI.
    let normalized = reply.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '[source]($2)');
    normalized = normalized.replace(/\(\s*\[source\]\((https?:\/\/[^\s)]+)\)\s*\)/gi, '[source]($1)');
    normalized = normalized.replace(/(?<!\])\((https?:\/\/[^\s)]+)\)/gi, '[source]($1)');
    normalized = normalized.replace(/(?<!\]\()https?:\/\/[^\s)\]]+/gi, (raw) => {
        const clean = raw.replace(/[.,;:!?]+$/g, '');
        const suffix = raw.slice(clean.length);
        return `[source](${clean})${suffix}`;
    });
    return normalized;
}
async function classifyWithGroq(userInput) {
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const sys = `Classify a message. Time: ${now}.\n` +
        'Return ONLY JSON. Types: timer(+seconds), ai_command(+command), question, text.\n' +
        'Examples: {"type":"timer","seconds":180} | {"type":"question"} | {"type":"text"}';
    const raw = await callGroq([
        { role: 'system', content: sys },
        { role: 'user', content: clampText(userInput, 600) },
    ], { maxTokens: 80 });
    try {
        const data = parseJsonFromModel(raw);
        if (typeof data === 'object' && data !== null && 'type' in data)
            return data;
    }
    catch {
        // Fall through to default return.
    }
    return { type: 'question' };
}
async function chatWithGroq(prompt, context) {
    const plan = await planWebSearch(prompt, context);
    const webResults = plan.shouldSearch ? await (0, webSearch_1.searchWeb)(plan.query) : [];
    if (webSearchDebugEnabled()) {
        const safeQuery = (plan.query || '').replace(/\s+/g, ' ').slice(0, 160);
        console.info(`[ai/chat] web-search shouldSearch=${plan.shouldSearch} query="${safeQuery}" results=${webResults.length}`);
    }
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const sys = `Concise assistant. Time: ${now}.\n` +
        '1-3 sentences unless asked for more. Do not mention nodes/graphs/context/internal structure.\n' +
        'Never mention training data cutoffs, knowledge cutoffs, or tool/browsing limitations.\n' +
        'If web evidence is provided, use it.\n' +
        (webResults.length
            ? 'When citing web evidence, use markdown links with the literal label "source", formatted like [source](https://example.com). Do not wrap links in extra parentheses, do not paste raw URLs, and do not list references separately.'
            : plan.shouldSearch
                ? 'A web lookup may have been attempted but no snippets were available. Give the best answer directly; if uncertain, state uncertainty briefly without mentioning tool limitations.'
                : 'If web evidence is not provided, answer directly from available knowledge without mentioning tool limitations.');
    const messages = [{ role: 'system', content: sys }];
    if (context)
        messages.push({ role: 'user', content: `Context:\n${clampText(context, contextMaxChars())}` });
    if (webResults.length) {
        messages.push({
            role: 'user',
            content: `Web search evidence:\n${formatSearchResults(webResults)}`,
        });
    }
    messages.push({ role: 'user', content: clampText(prompt, 1600) });
    const rawReply = await callGroq(messages, { maxTokens: chatMaxTokens() });
    return normalizeSourceCitations(rawReply);
}
async function suggestWithGroq(prompt, context) {
    const sys = 'Generate 3 follow-up suggestions. Return ONLY JSON: {"suggestions":["...","...","..."]}. No nodes/graphs.';
    const msgs = [{ role: 'system', content: sys }];
    if (context)
        msgs.push({ role: 'user', content: `Context:\n${clampText(context, 900)}` });
    msgs.push({ role: 'user', content: clampText(prompt, 600) });
    const raw = await callGroq(msgs, { maxTokens: 180 });
    try {
        const data = parseJsonFromModel(raw);
        if (typeof data === 'object' && data !== null && 'suggestions' in data) {
            return data.suggestions;
        }
    }
    catch {
        // Fall through.
    }
    return [];
}
async function mergeWithGroq(a, b) {
    return callGroq([
        { role: 'system', content: "Merge two texts into one concise clean version. Don't mention merging." },
        { role: 'user', content: `Text A:\n${clampText(a, 1200)}` },
        { role: 'user', content: `Text B:\n${clampText(b, 1200)}` },
    ], { maxTokens: 300 });
}
async function findWithGroq(query, nodeDescs) {
    const sys = 'Graph search: find the single most relevant node. Return ONLY JSON: {"nodeId":<int>} or {"nodeId":null}.';
    const raw = await callGroq([
        { role: 'system', content: sys },
        { role: 'user', content: `Query: ${clampText(query, 240)}\n\nNodes:\n${clampText(JSON.stringify(nodeDescs), 6000)}` },
    ], { maxTokens: 80 });
    try {
        const data = parseJsonFromModel(raw);
        if (typeof data === 'object' && data !== null && 'nodeId' in data) {
            return data.nodeId;
        }
    }
    catch {
        // Fall through.
    }
    return null;
}
async function brainstormWithGroq(topic) {
    const sys = 'You are a brainstorm assistant. Analyze the topic and branch out conceptually. ' +
        'Generate necessary, highly related subtopics. The number of subtopics should fit the complexity ' +
        'of the topic (between 2 and 8). Return ONLY a valid JSON array of strings. Do not include markdown.';
    const raw = await callGroq([
        { role: 'system', content: sys },
        { role: 'user', content: clampText(topic, 1600) },
    ], { maxTokens: 500 });
    try {
        const data = parseJsonFromModel(raw);
        if (Array.isArray(data))
            return data;
    }
    catch {
        // Fall through.
    }
    return [`${topic} idea 1`, `${topic} idea 2`, `${topic} idea 3`];
}
