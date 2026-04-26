"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./loadEnv");
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app_1 = __importDefault(require("./app"));
const pool_1 = require("./db/pool");
const events_1 = require("./sockets/events");
const PORT = parseInt(process.env.PORT || '4000', 10);
const httpServer = http_1.default.createServer(app_1.default);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:4000'],
        credentials: true,
    },
});
(0, events_1.registerSocketEvents)(io);
async function start() {
    await (0, pool_1.initSchema)();
    httpServer.listen(PORT, () => {
        console.log(`🚀 NODEX backend running at http://localhost:${PORT}`);
    });
}
start().catch(console.error);
