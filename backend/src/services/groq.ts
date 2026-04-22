import axios, { isAxiosError } from 'axios';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Production default; override with GROQ_MODEL. Preview IDs can fail for some accounts or regions. */
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function groqModel(): string {
  const m = (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
  return m || DEFAULT_GROQ_MODEL;
}

/** Normalize key from .env (BOM, quotes, CR/LF, zero-width chars). */
export function getGroqApiKey(): string {
  let raw = process.env.GROQ_API_KEY ?? '';
  raw = raw.replace(/^\uFEFF/, '');
  raw = raw.replace(/[\u200B-\u200D\uFEFF]/g, '');
  raw = raw.replace(/\r/g, '');
  raw = raw.trim();
  raw = raw.replace(/^['"]|['"]$/g, '').trim();
  // Groq keys are `gsk_` + letters/digits only; trailing paste junk often inflates length.
  const token = raw.match(/^(gsk_[A-Za-z0-9]+)/);
  if (token) {
    return token[1];
  }
  return raw;
}

function requireGroqKey(): void {
  if (!getGroqApiKey()) {
    throw new Error(
      'GROQ_API_KEY is missing. Add it to backend/.env or the repo-root .env (see backend/.env.example).'
    );
  }
}

function formatGroqFailure(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    const groqMsg = data?.error?.message;
    if (groqMsg) return groqMsg;
    const status = err.response?.status;
    if (status) return `Groq HTTP ${status}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function groqAuthError(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  if (err.response?.status === 401) return true;
  const msg = (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? '';
  return /invalid\s+api\s*key/i.test(msg);
}

/** Safe default for logs. Set GROQ_DEBUG_PRINT_FULL_KEY=1 to log the exact string (do not commit logs). */
function maskGroqKeyForLog(key: string): string {
  if (!key) return '(empty after normalize)';
  if (key.length <= 12) return `${key.length} chars, starts with ${JSON.stringify(key.slice(0, 3))}`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (${key.length} chars)`;
}

function logReceivedKeyIfInvalidApiKey(err: unknown): void {
  if (!groqAuthError(err)) return;
  const key = getGroqApiKey();
  const full =
    process.env.GROQ_DEBUG_PRINT_FULL_KEY === '1' ||
    process.env.GROQ_DEBUG_PRINT_FULL_KEY === 'true' ||
    process.env.GROQ_DEBUG_PRINT_FULL_KEY === 'yes';
  if (full) {
    console.warn('[groq] Invalid API key — GROQ_API_KEY value as received (remove GROQ_DEBUG_PRINT_FULL_KEY when done):');
    console.warn(key);
  } else {
    console.warn('[groq] Invalid API key — GROQ_API_KEY as received (masked). To log the full value locally, set GROQ_DEBUG_PRINT_FULL_KEY=1 in .env:');
    console.warn(maskGroqKeyForLog(key));
    console.warn('[groq] Last 8 chars JSON-escaped (spot hidden \\r, spaces, or quotes):', JSON.stringify(key.slice(-8)));
    if (key.length > 53 || key.length < 48) {
      console.warn(
        '[groq] Groq keys are usually ~51 characters after cleanup. If length is off, re-paste the key on one line with no spaces around `=`.'
      );
    }
  }
}

async function callGroq(messages: Message[]): Promise<string> {
  requireGroqKey();
  try {
    const response = await axios.post(
      GROQ_URL,
      {
        model: groqModel(),
        messages,
        max_tokens: 4096,
      },
      {
        headers: {
          Authorization: `Bearer ${getGroqApiKey()}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );
    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Groq returned an empty reply.');
    }
    return content;
  } catch (err) {
    logReceivedKeyIfInvalidApiKey(err);
    throw new Error(formatGroqFailure(err));
  }
}

export async function classifyWithGroq(userInput: string): Promise<Record<string, unknown>> {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const sys = `Classify a message. Time: ${now}.\nReturn ONLY JSON. Types: timer(+seconds), ai_command(+command), question, text.\nExamples: {"type":"timer","seconds":180} | {"type":"question"} | {"type":"text"}`;
  const raw = await callGroq([
    { role: 'system', content: sys },
    { role: 'user', content: userInput },
  ]);
  try {
    const d = JSON.parse(raw);
    if (typeof d === 'object' && d !== null && 'type' in d) return d;
  } catch (_) {}
  return { type: 'question' };
}

export async function chatWithGroq(prompt: string, context: string): Promise<string> {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const sys = `Concise assistant. Time: ${now}.\n1-3 sentences unless asked for more. Don't mention nodes/graphs/context/internal structure.`;
  const msgs: Message[] = [{ role: 'system', content: sys }];
  if (context) msgs.push({ role: 'user', content: 'Context:\n' + context });
  msgs.push({ role: 'user', content: prompt });
  return callGroq(msgs);
}

export async function suggestWithGroq(prompt: string, context: string): Promise<string[]> {
  const sys = 'Generate 3 follow-up suggestions. Return ONLY JSON: {"suggestions":["...","...","..."]}. No nodes/graphs.';
  const msgs: Message[] = [{ role: 'system', content: sys }];
  if (context) msgs.push({ role: 'user', content: 'Context:\n' + context });
  msgs.push({ role: 'user', content: prompt });
  const raw = await callGroq(msgs);
  try {
    const d = JSON.parse(raw);
    if (typeof d === 'object' && d !== null && 'suggestions' in d) return d.suggestions as string[];
  } catch (_) {}
  return [];
}

export async function mergeWithGroq(a: string, b: string): Promise<string> {
  return callGroq([
    { role: 'system', content: "Merge two texts into one concise clean version. Don't mention merging." },
    { role: 'user', content: 'Text A:\n' + a },
    { role: 'user', content: 'Text B:\n' + b },
  ]);
}

export async function findWithGroq(
  query: string,
  nodeDescs: { id: number; text: string }[]
): Promise<number | null> {
  const sys = 'Graph search: find the single most relevant node. Return ONLY JSON: {"nodeId":<int>} or {"nodeId":null}.';
  const raw = await callGroq([
    { role: 'system', content: sys },
    { role: 'user', content: `Query: ${query}\n\nNodes:\n${JSON.stringify(nodeDescs)}` },
  ]);
  try {
    const clean = raw.trim().replace(/```json|```/g, '').trim();
    const d = JSON.parse(clean);
    if (typeof d === 'object' && d !== null && 'nodeId' in d) return d.nodeId as number | null;
  } catch (_) {}
  return null;
}

export async function brainstormWithGroq(topic: string): Promise<string[]> {
  const sys =
    'You are a brainstorm assistant. Analyze the topic and branch out conceptually. Generate necessary, highly related subtopics. The number of subtopics should fit the complexity of the topic (between 2 and 8). Return ONLY a valid JSON array of strings. Do not include markdown formatting. Example output: ["Subtopic A", "Subtopic B", "Subtopic C"]';
  const raw = await callGroq([
    { role: 'system', content: sys },
    { role: 'user', content: topic },
  ]);
  try {
    const clean = raw.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    if (Array.isArray(result)) return result as string[];
  } catch (_) {}
  return [`${topic} idea 1`, `${topic} idea 2`, `${topic} idea 3`];
}
