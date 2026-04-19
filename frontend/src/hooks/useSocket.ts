import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGraphStore } from '../store/graphStore';
import type { RemoteCursorData, PresenceUser, GraphData } from '../types';

interface UseSocketOptions {
  shareId?: string;
  onCursorUpdate?: (data: RemoteCursorData) => void;
  onCursorRemove?: (id: string) => void;
  onPresenceUpdate?: (users: PresenceUser[]) => void;
  onNodeMove?: (data: { id: number; x: number; y: number }) => void;
  onGraphSync?: (graph: GraphData) => void;
}

export function useSocket(options: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const { shareId, onCursorUpdate, onCursorRemove, onPresenceUpdate, onNodeMove, onGraphSync } = options;

  useEffect(() => {
    if (!shareId) return;

    const socket = io('/', { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { room: shareId });
    });

    if (onPresenceUpdate) socket.on('presence_update', onPresenceUpdate);
    if (onCursorUpdate) socket.on('cursor_update', onCursorUpdate);
    if (onCursorRemove) socket.on('cursor_remove', ({ id }: { id: string }) => onCursorRemove(id));
    if (onNodeMove) socket.on('node_move', onNodeMove);
    if (onGraphSync) {
      socket.on('graph_sync', (graphData: GraphData) => {
        onGraphSync(graphData);
        useGraphStore.getState().setGraph(graphData);
      });
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [shareId]); // eslint-disable-line react-hooks/exhaustive-deps

  const emitCursorMove = (x: number, y: number) => {
    if (shareId && socketRef.current) {
      socketRef.current.emit('cursor_move', { room: shareId, x, y });
    }
  };

  const emitNodeMove = (id: number, x: number, y: number) => {
    if (shareId && socketRef.current) {
      socketRef.current.emit('node_move', { room: shareId, id, x, y });
    }
  };

  const emitNodeText = (id: number, text: string) => {
    if (shareId && socketRef.current) {
      socketRef.current.emit('node_text', { room: shareId, id, text });
    }
  };

  const emitGraphUpdate = (graph: GraphData) => {
    if (shareId && socketRef.current) {
      socketRef.current.emit('graph_update', { room: shareId, graph });
    }
  };

  return { emitCursorMove, emitNodeMove, emitNodeText, emitGraphUpdate, socket: socketRef };
}
