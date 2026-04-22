import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getGroqApiKey } from './services/groq';

// __dirname is `backend/src` (tsx) or `backend/dist` (node).
const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const backendEnv = path.join(backendDir, '.env');
const rootEnv = path.join(repoRoot, '.env');

// Load backend/.env first (canonical for this app), then repo-root .env with override:false
// so root only fills *missing* keys. Stops a wrong/outdated GROQ_API_KEY in repo-root .env
// from overwriting a good key in backend/.env.
if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
}
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv, override: false });
}

if (!getGroqApiKey()) {
  console.warn(
    '[nodex] GROQ_API_KEY is not set after loading .env files:\n' +
      `  checked: ${backendEnv}, ${rootEnv}\n` +
      '  Add GROQ_API_KEY to backend/.env (or repo-root .env if backend has no key). See backend/.env.example.'
  );
}
