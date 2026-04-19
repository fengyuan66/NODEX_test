import React, { useState, useCallback } from 'react';
import type { Group } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { useGraph } from '../../hooks/useGraph';

interface GroupHullProps {
  group: Group;
  onMoveStart?: (id: number, e: React.MouseEvent) => void;
}

export default function GroupHull({ group, onMoveStart }: GroupHullProps) {
  const { nodes } = useGraphStore();
  const { collapseGroup, expandGroup, deleteGroup, updateGroup, saveGraph } = useGraph();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const closeCtx = () => setCtxMenu(null);

  const handleRename = () => {
    const n = prompt('Group name:', group.name);
    if (n !== null) {
      updateGroup(group.id, { name: n.trim() || group.name });
      void saveGraph();
    }
    closeCtx();
  };

  const handleToggle = () => {
    if (group.collapsed) expandGroup(group.id);
    else collapseGroup(group.id);
    closeCtx();
  };

  const handleDelete = () => {
    deleteGroup(group.id);
    closeCtx();
  };

  const handlePointerDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.classList.contains('group-resize-handle')) return;
    e.stopPropagation();
    if (onMoveStart) onMoveStart(group.id, e);
  };

  if (group.collapsed) {
    const cx = group.collapsedX || 3000;
    const cy = group.collapsedY || 3000;
    const cw = group.collapsedW || 160;
    const ch = group.collapsedH || 60;

    return (
      <>
        <div
          className="group-hull collapsed"
          data-gid={group.id}
          style={{ left: cx, top: cy, width: cw, height: ch, borderColor: group.color, background: group.color, boxShadow: `0 0 18px ${group.color}44` }}
          onDoubleClick={e => { e.stopPropagation(); expandGroup(group.id); }}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
        >
          <div className="group-resize-handle" />
        </div>
        <div
          className="group-label collapsed-label"
          style={{ left: cx + 8, top: cy + ch / 2 - 7, color: group.color, fontSize: '11px' }}
          onDoubleClick={() => expandGroup(group.id)}
        >
          {group.name} ({group.nodeIds.length})
        </div>
        {ctxMenu && (
          <CtxMenuPopup
            x={ctxMenu.x} y={ctxMenu.y}
            isCollapsed={group.collapsed}
            onRename={handleRename}
            onRecolor={() => { closeCtx(); window.dispatchEvent(new CustomEvent('canvas:triggerGroupRecolor', { detail: { id: group.id } })); }}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onClose={closeCtx}
          />
        )}
      </>
    );
  }

  const memberNodes = nodes.filter(n => group.nodeIds.includes(n.id));
  if (memberNodes.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  memberNodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + 150);
    maxY = Math.max(maxY, n.y + 50);
  });
  const pad = 24;

  return (
    <>
      <div style={{ position: 'absolute', left: minX - pad, top: minY - pad - 18, color: group.color, fontSize: '10px', opacity: 0.55, letterSpacing: '0.06em', textTransform: 'uppercase', zIndex: 3, pointerEvents: 'none' }}>
        {group.name}
      </div>
      <div
        className="group-hull"
        data-gid={group.id}
        style={{ left: minX - pad, top: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2, borderColor: group.color, background: group.color }}
        onContextMenu={handleContextMenu}
        onClick={e => { if (e.shiftKey) { e.stopPropagation(); deleteGroup(group.id); } }}
        onPointerDown={handlePointerDown}
      />
      {ctxMenu && (
        <CtxMenuPopup
          x={ctxMenu.x} y={ctxMenu.y}
          isCollapsed={group.collapsed}
          onRename={handleRename}
          onRecolor={() => { closeCtx(); window.dispatchEvent(new CustomEvent('canvas:triggerGroupRecolor', { detail: { id: group.id } })); }}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onClose={closeCtx}
        />
      )}
    </>
  );
}

function CtxMenuPopup({ x, y, isCollapsed, onRename, onRecolor, onToggle, onDelete, onClose }: {
  x: number; y: number; isCollapsed: boolean;
  onRename: () => void; onRecolor: () => void; onToggle: () => void; onDelete: () => void; onClose: () => void;
}) {
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      id="ctx-menu"
      className="visible"
      style={{ left: x, top: y }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="ctx-item" onClick={onRename}>Rename group</div>
      <div className="ctx-item" onClick={onRecolor}>Change color</div>
      <div className="ctx-item" onClick={onToggle}>{isCollapsed ? 'Expand group' : 'Collapse group'}</div>
      <div className="ctx-item danger" onClick={onDelete}>Delete group</div>
    </div>
  );
}
