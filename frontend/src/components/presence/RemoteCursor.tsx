import React, { useEffect, useState } from 'react';
import type { RemoteCursorData } from '../../types';
import { useGraphStore } from '../../store/graphStore';

interface RemoteCursorProps {
  cursor: RemoteCursorData;
}

export default function RemoteCursor({ cursor }: RemoteCursorProps) {
  const { currentScale } = useGraphStore();
  
  // Minimal animation smoothing wrapper
  const [pos, setPos] = useState({ x: cursor.x, y: cursor.y });

  useEffect(() => {
    setPos({ x: cursor.x, y: cursor.y });
  }, [cursor.x, cursor.y]);

  return (
    <div
      className="remote-cursor"
      style={{
        left: pos.x * currentScale, // Simplified positioning depending on DOM structure
        top: pos.y * currentScale,
        color: cursor.color,
      }}
    >
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 0l15 6-6 1.5L7.5 15z" />
      </svg>
      <div className="remote-cursor-label">
        {cursor.email?.split('@')[0]}
      </div>
    </div>
  );
}
