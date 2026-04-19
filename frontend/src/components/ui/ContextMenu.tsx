import React, { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  groupId: number | null;
  onRename: () => void;
  onRecolor: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onClose: () => void;
  isCollapsed: boolean;
}

export default function ContextMenu({
  x, y, groupId, onRename, onRecolor, onToggleCollapse, onDelete, onClose, isCollapsed
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (groupId === null) return null;

  return (
    <div
      id="ctx-menu"
      ref={menuRef}
      className="visible"
      style={{ left: x, top: y, position: 'fixed', display: 'block' }}
    >
      <div className="ctx-item" onClick={onRename}>Rename group</div>
      <div className="ctx-item" onClick={onRecolor}>Change color</div>
      <div className="ctx-item" onClick={onToggleCollapse}>
        {isCollapsed ? 'Expand group' : 'Collapse group'}
      </div>
      <div className="ctx-item danger" onClick={onDelete}>Delete group</div>
    </div>
  );
}
