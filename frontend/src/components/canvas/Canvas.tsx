import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { useGraph } from '../../hooks/useGraph';
import { useCanvas } from '../../hooks/useCanvas';
import { useSocket } from '../../hooks/useSocket';
import { aiApi } from '../../api/client';
import { apiErrorMessage } from '../../utils/apiError';
import Node from './Node';
import LinkLayer from './LinkLayer';
import GroupHull from './GroupHull';
import LassoBox from './LassoBox';

interface CanvasProps {
  shareId?: string;
}

const MERGE_THRESHOLD = 60;

export default function Canvas({ shareId }: CanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { nodes, groups, currentScale } = useGraphStore();
  const { updateNode, deleteNode, deleteLink, addLink, mergeNodes, selectNode, deselectAll, addNodeToGroup, updateGroup, saveGraph } = useGraph();
  const { applyZoom, smartRecenter, clientToCanvas, initCanvas, CANVAS_W, CANVAS_H } = useCanvas(wrapperRef);
  const { emitNodeMove, emitNodeText, emitCursorMove } = useSocket({ shareId });

  const [isPanning, setIsPanning] = useState(false);
  const [lasso, setLasso] = useState({ visible: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0 });
  const [mergeHint, setMergeHint] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [groupAddHint, setGroupAddHint] = useState<{ x: number; y: number; name: string; visible: boolean }>({ x: 0, y: 0, name: '', visible: false });

  const draggingNodeRef = useRef<number | null>(null);
  const draggingGroupRef = useRef<number | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const groupDragOffsetRef = useRef({ x: 0, y: 0 });
  const groupDragNodeOffsetsRef = useRef<{ id: number, dx: number, dy: number }[]>([]);
  const panStateRef = useRef({ startX: 0, startY: 0, scrollX: 0, scrollY: 0, moved: false });
  const mergeTargetRef = useRef<number | null>(null);
  const groupAddTargetRef = useRef<number | null>(null);

  useEffect(() => { initCanvas(); }, [initCanvas]);

  // Recenter on first load when nodes exist
  useEffect(() => {
    const unsub = useGraphStore.subscribe(state => {
      if (state.nodes.length > 0) {
        setTimeout(() => smartRecenter(false), 120);
        unsub();
      }
    });
    return unsub;
  }, [smartRecenter]);

  // Canvas event bridge (zoom controls)
  useEffect(() => {
    const scaleRef = { current: currentScale };
    scaleRef.current = currentScale;
    const zIn = () => applyZoom(useGraphStore.getState().currentScale + 0.08);
    const zOut = () => applyZoom(useGraphStore.getState().currentScale - 0.08);
    const rec = () => smartRecenter();
    window.addEventListener('canvas:zoomIn', zIn);
    window.addEventListener('canvas:zoomOut', zOut);
    window.addEventListener('canvas:recenter', rec);
    return () => {
      window.removeEventListener('canvas:zoomIn', zIn);
      window.removeEventListener('canvas:zoomOut', zOut);
      window.removeEventListener('canvas:recenter', rec);
    };
  }, [applyZoom, smartRecenter]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.node') || target.classList.contains('edge') || target.closest('.group-hull') || target.closest('.group-label')) return;
    
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      panStateRef.current = { startX: e.clientX, startY: e.clientY, scrollX: wrapperRef.current?.scrollLeft || 0, scrollY: wrapperRef.current?.scrollTop || 0, moved: false };
      return;
    }

    if (e.button === 0) {
      if (e.shiftKey) {
        // Lasso
        const pt = clientToCanvas(e.clientX, e.clientY);
        setLasso({ visible: true, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, w: 0, h: 0 });
        return;
      }
      // Pan on empty canvas
      setIsPanning(true);
      panStateRef.current = { startX: e.clientX, startY: e.clientY, scrollX: wrapperRef.current?.scrollLeft || 0, scrollY: wrapperRef.current?.scrollTop || 0, moved: false };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    emitCursorMove(e.clientX, e.clientY);

    if (isPanning) {
      if (!wrapperRef.current) return;
      const dx = e.clientX - panStateRef.current.startX;
      const dy = e.clientY - panStateRef.current.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panStateRef.current.moved = true;
      wrapperRef.current.scrollLeft = panStateRef.current.scrollX - dx;
      wrapperRef.current.scrollTop = panStateRef.current.scrollY - dy;
      return;
    }

    if (lasso.visible) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      const minX = Math.min(lasso.startX, pt.x), minY = Math.min(lasso.startY, pt.y);
      const w = Math.abs(pt.x - lasso.startX), h = Math.abs(pt.y - lasso.startY);
      setLasso(prev => ({ ...prev, x: minX, y: minY, w, h }));
      return;
    }

    if (draggingGroupRef.current !== null) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      const ox = pt.x - groupDragOffsetRef.current.x;
      const oy = pt.y - groupDragOffsetRef.current.y;
      
      const { groups } = useGraphStore.getState();
      const g = groups.find(x => x.id === draggingGroupRef.current);
      if (g) {
        if (g.collapsed) {
          updateGroup(g.id, { collapsedX: ox, collapsedY: oy });
        } else {
          useGraphStore.setState(s => {
            const updates = Object.fromEntries(groupDragNodeOffsetsRef.current.map(n => [n.id, { x: ox + n.dx, y: oy + n.dy }]));
            return { nodes: s.nodes.map(n => updates[n.id] ? { ...n, ...updates[n.id] } : n) };
          });
          
          groupDragNodeOffsetsRef.current.forEach(n => emitNodeMove(n.id, ox + n.dx, oy + n.dy));
        }
      }
      return;
    }

    if (draggingNodeRef.current !== null) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      const x = pt.x - dragOffsetRef.current.x;
      const y = pt.y - dragOffsetRef.current.y;
      updateNode(draggingNodeRef.current, { x, y });
      emitNodeMove(draggingNodeRef.current, x, y);

      // Check merge hint
      const currentNodes = useGraphStore.getState().nodes;
      let closest: number | null = null, closestDist = Infinity;
      currentNodes.forEach(other => {
        if (other.id === draggingNodeRef.current!) return;
        const dx = other.x - x, dy = other.y - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < closestDist) { closestDist = d; closest = other.id; }
      });
      if (closest !== null && closestDist < MERGE_THRESHOLD) {
        mergeTargetRef.current = closest;
        const tgt = currentNodes.find(n => n.id === closest);
        if (tgt) setMergeHint({ x: tgt.x + 20, y: tgt.y - 10, visible: true });
      } else {
        mergeTargetRef.current = null;
        setMergeHint(h => ({ ...h, visible: false }));
      }

      // Check group-add hint
      const currentGroups = useGraphStore.getState().groups;
      let foundGroup: number | null = null;
      for (const g of currentGroups) {
        if (g.nodeIds.includes(draggingNodeRef.current!)) continue;
        if (g.collapsed && g.collapsedX != null && g.collapsedY != null) {
          const cw = g.collapsedW || 160, ch = g.collapsedH || 60;
          if (x > g.collapsedX && x < g.collapsedX + cw && y > g.collapsedY && y < g.collapsedY + ch) {
            foundGroup = g.id; setGroupAddHint({ x: x + 20, y: y - 10, name: g.name, visible: true }); break;
          }
        } else {
          const members = currentNodes.filter(n => g.nodeIds.includes(n.id));
          if (!members.length) continue;
          const pad = 24;
          const minX = Math.min(...members.map(n => n.x)) - pad;
          const maxX = Math.max(...members.map(n => n.x + 150)) + pad;
          const minY = Math.min(...members.map(n => n.y)) - pad;
          const maxY = Math.max(...members.map(n => n.y + 50)) + pad;
          if (x > minX && x < maxX && y > minY && y < maxY) {
            foundGroup = g.id; setGroupAddHint({ x: x + 20, y: y - 10, name: g.name, visible: true }); break;
          }
        }
      }
      if (!foundGroup) { groupAddTargetRef.current = null; setGroupAddHint(h => ({ ...h, visible: false })); }
      else groupAddTargetRef.current = foundGroup;
    }
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (isPanning && !panStateRef.current.moved) {
      deselectAll();
    }
    setIsPanning(false);

    if (lasso.visible) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      const minX = Math.min(lasso.startX, pt.x), maxX = Math.max(lasso.startX, pt.x);
      const minY = Math.min(lasso.startY, pt.y), maxY = Math.max(lasso.startY, pt.y);
      useGraphStore.setState(s => ({
        nodes: s.nodes.map(n => ({
          ...n,
          selected: n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY ? true : n.selected,
        }))
      }));
      setLasso(prev => ({ ...prev, visible: false }));
      return;
    }

    if (draggingGroupRef.current !== null) {
      draggingGroupRef.current = null;
      await saveGraph();
      return;
    }

    if (draggingNodeRef.current !== null) {
      const srcId = draggingNodeRef.current;
      draggingNodeRef.current = null;
      setMergeHint(h => ({ ...h, visible: false }));
      setGroupAddHint(h => ({ ...h, visible: false }));

      if (groupAddTargetRef.current !== null) {
        const gid = groupAddTargetRef.current;
        const g = useGraphStore.getState().groups.find(x => x.id === gid);
        groupAddTargetRef.current = null;
        if (g && confirm(`Add node to group "${g.name}"?`)) addNodeToGroup(srcId, gid);
        await saveGraph();
        return;
      }

      if (mergeTargetRef.current !== null) {
        const tgtId = mergeTargetRef.current;
        mergeTargetRef.current = null;
        if (confirm('Merge these nodes with AI?')) {
          const { nodes } = useGraphStore.getState();
          const tgt = nodes.find(n => n.id === tgtId);
          const src = nodes.find(n => n.id === srcId);
          try {
            const res = await aiApi.merge(tgt?.text || '', src?.text || '');
            await mergeNodes(tgtId, srcId, res.data.merged || `${tgt?.text}\n${src?.text}`);
          } catch (e) {
            alert(apiErrorMessage(e, 'AI merge failed; using plain text instead.'));
            await mergeNodes(tgtId, srcId, `${tgt?.text}\n${src?.text}`);
          }
        }
        return;
      }
      await saveGraph();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const rect = wrapperRef.current!.getBoundingClientRect();
      applyZoom(currentScale + delta, e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  const onNodeMoveStart = (id: number, e: React.MouseEvent) => {
    const node = useGraphStore.getState().nodes.find(n => n.id === id);
    if (!node) return;
    const pt = clientToCanvas(e.clientX, e.clientY);
    dragOffsetRef.current = { x: pt.x - node.x, y: pt.y - node.y };
    draggingNodeRef.current = id;
  };

  const onGroupMoveStart = (id: number, e: React.MouseEvent) => {
    const group = useGraphStore.getState().groups.find(g => g.id === id);
    if (!group) return;
    const pt = clientToCanvas(e.clientX, e.clientY);
    
    draggingGroupRef.current = id;
    
    if (group.collapsed) {
      groupDragOffsetRef.current = { x: pt.x - (group.collapsedX || 0), y: pt.y - (group.collapsedY || 0) };
    } else {
      const { nodes } = useGraphStore.getState();
      const memberNodes = nodes.filter(n => group.nodeIds.includes(n.id));
      
      let minX = Infinity, minY = Infinity;
      memberNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
      });
      const pad = 24;
      const hullX = minX - pad;
      const hullY = minY - pad;
      
      groupDragOffsetRef.current = { x: pt.x - hullX, y: pt.y - hullY };
      groupDragNodeOffsetsRef.current = memberNodes.map(n => ({ id: n.id, dx: n.x - hullX, dy: n.y - hullY }));
    }
  };

  return (
    <div
      id="canvas-wrapper"
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setIsPanning(false);
        setLasso(prev => ({ ...prev, visible: false }));
        draggingNodeRef.current = null;
      }}
      onWheel={handleWheel}
      style={{ flex: 1, cursor: isPanning ? 'grabbing' : 'default' }}
    >
      <div
        id="canvas"
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${currentScale})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}
      >
        <LinkLayer onDeleteLink={deleteLink} />
        {groups.map(g => (
          <GroupHull
            key={`g-${g.id}-${g.collapsed}`}
            group={g}
            onMoveStart={onGroupMoveStart}
          />
        ))}
        {nodes
          .filter(n => {
            if (n.groupId === undefined) return true;
            const g = groups.find(x => x.id === n.groupId);
            return !g?.collapsed;
          })
          .map(n => (
            <Node
              key={n.id}
              node={n}
              onMoveStart={onNodeMoveStart}
              onTextChange={(id, text) => updateNode(id, { text })}
              emitNodeText={emitNodeText}
              onDelete={deleteNode}
              onAddLink={addLink}
              onSave={saveGraph}
            />
          ))}
        <LassoBox {...lasso} />
        {mergeHint.visible && (
          <div style={{ position: 'absolute', left: mergeHint.x, top: mergeHint.y, background: 'rgba(124,58,237,0.9)', color: 'white', fontSize: '10px', padding: '3px 8px', borderRadius: '6px', pointerEvents: 'none', zIndex: 9999 }}>Merge?</div>
        )}
        {groupAddHint.visible && (
          <div style={{ position: 'absolute', left: groupAddHint.x, top: groupAddHint.y, background: 'rgba(251,191,36,0.9)', color: '#000', fontSize: '10px', padding: '3px 8px', borderRadius: '6px', pointerEvents: 'none', zIndex: 9999 }}>Add to {groupAddHint.name}?</div>
        )}
      </div>
    </div>
  );
}
