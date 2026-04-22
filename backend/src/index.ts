import './loadEnv';
import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { initSchema } from './db/pool';
import { registerSocketEvents } from './sockets/events';

const PORT = parseInt(process.env.PORT || '4000', 10);

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:4000'],
    credentials: true,
  },
});

registerSocketEvents(io);

async function start(): Promise<void> {
  await initSchema();
  httpServer.listen(PORT, () => {
    console.log(`🚀 NODEX backend running at http://localhost:${PORT}`);
  });
}

start().catch(console.error);
