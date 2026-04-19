import React from 'react';
import type { PresenceUser } from '../../types';

interface PresenceBarProps {
  users: PresenceUser[];
}

export default function PresenceBar({ users }: PresenceBarProps) {
  if (!users || users.length === 0) return null;

  return (
    <div id="presence-bar">
      {users.map((u, i) => (
        <div
          key={i}
          className="presence-avatar"
          style={{ background: u.color, zIndex: users.length - i }}
          title={u.email}
        >
          {u.email[0].toUpperCase()}
        </div>
      ))}
    </div>
  );
}
