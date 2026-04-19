import axios from 'axios';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callGroq(messages: Message[]): Promise<string> {
  const response = await axios.post(
    GROQ_URL,
    { model: GROQ_MODEL, messages },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );
  return response.data.choices[0].message.content as string;
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
