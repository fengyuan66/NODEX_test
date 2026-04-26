"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const groq_1 = require("./services/groq");
// __dirname is `backend/src` (tsx) or `backend/dist` (node).
const backendDir = path_1.default.resolve(__dirname, '..');
const repoRoot = path_1.default.resolve(backendDir, '..');
const backendEnv = path_1.default.join(backendDir, '.env');
const rootEnv = path_1.default.join(repoRoot, '.env');
// Load backend/.env first (canonical for this app), then repo-root .env with override:false
// so root only fills *missing* keys. Stops a wrong/outdated GROQ_API_KEY in repo-root .env
// from overwriting a good key in backend/.env.
if (fs_1.default.existsSync(backendEnv)) {
    dotenv_1.default.config({ path: backendEnv });
}
if (fs_1.default.existsSync(rootEnv)) {
    dotenv_1.default.config({ path: rootEnv, override: false });
}
if (!(0, groq_1.getGroqApiKey)()) {
    console.warn('[nodex] GROQ_API_KEY is not set after loading .env files:\n' +
        `  checked: ${backendEnv}, ${rootEnv}\n` +
        '  Add GROQ_API_KEY to backend/.env (or repo-root .env if backend has no key). See backend/.env.example.');
}
