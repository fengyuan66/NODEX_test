import { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';

interface RoomUser {
  email: string;
  color: string;
}

const connectedUsers: Record<string, Record<string, RoomUser>> = {};
const USER_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#60a5fa','#a78bfa','#f472b6'];

export function registerSocketEvents(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const session = (socket.request as { session?: { email?: string } }).session;
    const email = session?.email || 'Anonymous';

    socket.on('join', (data: { room: string }) => {
      const { room } = data;
      socket.join(room);
      if (!connectedUsers[room]) connectedUsers[room] = {};
      const color = USER_COLORS[Object.keys(connectedUsers[room]).length % USER_COLORS.length];
      connectedUsers[room][socket.id] = { email, color };
      io.to(room).emit('presence_update', Object.values(connectedUsers[room]));
    });

    socket.on('disconnect', () => {
      for (const room in connectedUsers) {
        if (connectedUsers[room][socket.id]) {
          delete connectedUsers[room][socket.id];
          io.to(room).emit('presence_update', Object.values(connectedUsers[room]));
          io.to(room).emit('cursor_remove', { id: socket.id });
        }
      }
    });

    socket.on('cursor_move', (data: { room: string; x: number; y: number }) => {
      const { room } = data;
      if (!room) return;
      const userInfo = connectedUsers[room]?.[socket.id];
      socket.to(room).emit('cursor_update', {
        id: socket.id,
        x: data.x,
        y: data.y,
        email,
        color: userInfo?.color || '#fff',
      });
    });

    // Granular node movement — low latency for smooth 60fps drag
    socket.on('node_move', (data: { room: string; id: number; x: number; y: number }) => {
      if (data.room) socket.to(data.room).emit('node_move', { id: data.id, x: data.x, y: data.y });
    });

    // Granular text update
    socket.on('node_text', (data: { room: string }) => {
      if (data.room) socket.to(data.room).emit('node_text', data);
    });

    // Full graph sync — save to DB + broadcast
    socket.on('graph_update', async (data: { room: string; graph: unknown }) => {
      const { room, graph } = data;
      if (!room) return;
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE graphs SET data=$1, updated_at=NOW() WHERE share_id=$2',
          [JSON.stringify(graph), room]
        );
      } catch (_) {}
      finally { client.release(); }
      socket.to(room).emit('graph_sync', graph);
    });
  });
}
