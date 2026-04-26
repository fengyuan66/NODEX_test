"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./loadEnv");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const auth_1 = __importDefault(require("./routes/auth"));
const graph_1 = __importDefault(require("./routes/graph"));
const ai_1 = __importDefault(require("./routes/ai"));
const settings_1 = __importDefault(require("./routes/settings"));
const app = (0, express_1.default)();
// CORS — allow Vite dev server
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:4000'],
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
// Session
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'nodex_dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // set true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 1 day default, extended on "remember me"
    },
}));
const path_1 = __importDefault(require("path"));
// Routes
app.use('/auth', auth_1.default);
app.use('/', graph_1.default);
app.use('/', ai_1.default);
app.use('/', settings_1.default);
// Serve static frontend in production
const frontendDistPath = path_1.default.join(__dirname, '../../frontend/dist');
app.use(express_1.default.static(frontendDistPath));
// Express 5 / path-to-regexp: unnamed "*" is invalid; use a named splat for SPA fallback.
app.get('/{*path}', (req, res) => {
    res.sendFile(path_1.default.join(frontendDistPath, 'index.html'));
});
exports.default = app;
