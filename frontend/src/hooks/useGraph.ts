import { useCallback, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import { graphApi } from '../api/client';
import type { GraphNode, Link, Group } from '../types';

const ORIGIN_X = 3000;
const ORIGIN_Y = 3000;
const GROUP_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#60a5fa','#a78bfa','#f472b6','#e2e8f0'];

export function useGraph() {
  const store = useGraphStore();

  const saveGraph = useCallback(async () => {
    const { nodes, links, groups, nextNodeId, nextLinkId, nextGroupId } = useGraphStore.getState();
    try {
      await graphApi.save({ nodes, links, groups, nextNodeId, nextLinkId, nextGroupId });
    } catch (_) {}
  }, []);

  const getSmartSpawnPos = useCallback(() => {
    const { nodes } = useGraphStore.getState();
    const sel = nodes.filter(n => n.selected);
    if (sel.length > 0) {
      const maxX = Math.max(...sel.map(n => n.x));
      const avgY = sel.reduce((s, n) => s + n.y, 0) / sel.length;
      return { x: maxX + 380, y: avgY };
    }
    if (nodes.length > 0) {
      const maxX = Math.max(...nodes.map(n => n.x)) + 380;
      const midY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
      return { x: maxX, y: midY };
    }
    return { x: ORIGIN_X, y: ORIGIN_Y };
  }, []);

  const dimAllNodes = useCallback(() => {
    useGraphStore.setState(s => ({
      nodes: s.nodes.map(n => ({ ...n, dim: Math.min((n.dim || 0) + 1, 4) }))
    }));
  }, []);

  const addLinkDirect = useCallback((sourceId: number, targetId: number) => {
    const { links, nextLinkId } = useGraphStore.getState();
    const exists = links.some(l =>
      (l.sourceId === sourceId && l.targetId === targetId) ||
      (l.sourceId === targetId && l.targetId === sourceId)
    );
    if (exists || sourceId === targetId) return;
    const newLink: Link = { id: nextLinkId, sourceId, targetId };
    useGraphStore.setState(s => ({ links: [...s.links, newLink], nextLinkId: s.nextLinkId + 1 }));
  }, []);

  const addNode = useCallback((type: GraphNode['type'], text: string, x?: number, y?: number, meta?: GraphNode['meta']): GraphNode => {
    store.pushUndo();
    const { nextNodeId, nodes } = useGraphStore.getState();
    const spawn = getSmartSpawnPos();
    const newNode: GraphNode = {
      id: nextNodeId,
      type,
      text,
      x: x ?? spawn.x,
      y: y ?? spawn.y,
      selected: false,
      dim: 0,
      completed: false,
      meta: meta ?? {},
    };
    const sel = nodes.filter(n => n.selected);
    useGraphStore.setState(s => ({ nodes: [...s.nodes, newNode], nextNodeId: s.nextNodeId + 1 }));

    // Auto-link
    const explicitlyDeselected = useGraphStore.getState().explicitlyDeselected;
    const lastNodeId = useGraphStore.getState().lastNodeId;
    if (sel.length > 0) {
      sel.forEach(s => addLinkDirect(s.id, newNode.id));
    } else if (!explicitlyDeselected && lastNodeId !== null) {
      addLinkDirect(lastNodeId, newNode.id);
    }
    useGraphStore.setState({ explicitlyDeselected: false, lastNodeId: newNode.id });

    void saveGraph();
    return newNode;
  }, [store, getSmartSpawnPos, addLinkDirect, saveGraph]);

  const updateNode = useCallback((id: number, updates: Partial<GraphNode>) => {
    useGraphStore.setState(s => ({
      nodes: s.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
    }));
  }, []);

  const deleteNode = useCallback((id: number) => {
    store.pushUndo();
    useGraphStore.setState(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      links: s.links.filter(l => l.sourceId !== id && l.targetId !== id),
      groups: s.groups.map(g => ({ ...g, nodeIds: g.nodeIds.filter(nid => nid !== id) }))
        .filter(g => g.nodeIds.length > 0),
    }));
    void saveGraph();
  }, [store, saveGraph]);

  const addLink = useCallback((sourceId: number, targetId: number) => {
    addLinkDirect(sourceId, targetId);
    void saveGraph();
  }, [addLinkDirect, saveGraph]);

  const deleteLink = useCallback((id: number) => {
    store.pushUndo();
    useGraphStore.setState(s => ({ links: s.links.filter(l => l.id !== id) }));
    void saveGraph();
  }, [store, saveGraph]);

  const mergeNodes = useCallback(async (targetId: number, sourceId: number, mergedText: string) => {
    store.pushUndo();
    useGraphStore.setState(s => ({
      nodes: s.nodes.map(n => n.id === targetId ? { ...n, text: mergedText } : n)
        .filter(n => n.id !== sourceId),
      links: s.links.filter(l => l.sourceId !== sourceId && l.targetId !== sourceId),
    }));
    void saveGraph();
  }, [store, saveGraph]);

  const createGroup = useCallback((nodeIds: number[], color: string, name?: string): Group => {
    store.pushUndo();
    const { nextGroupId } = useGraphStore.getState();
    const group: Group = {
      id: nextGroupId,
      name: name || `Group ${nextGroupId}`,
      color,
      nodeIds: [...nodeIds],
      collapsed: false,
      collapsedW: 160,
      collapsedH: 60,
      collapsedX: null,
      collapsedY: null,
    };
    useGraphStore.setState(s => ({
      groups: [...s.groups, group],
      nextGroupId: s.nextGroupId + 1,
      nodes: s.nodes.map(n => nodeIds.includes(n.id) ? { ...n, groupId: group.id } : n),
    }));
    void saveGraph();
    return group;
  }, [store, saveGraph]);

  const deleteGroup = useCallback((gid: number) => {
    store.pushUndo();
    useGraphStore.setState(s => ({
      groups: s.groups.filter(g => g.id !== gid),
      nodes: s.nodes.map(n => n.groupId === gid ? { ...n, groupId: undefined } : n),
    }));
    void saveGraph();
  }, [store, saveGraph]);

  const updateGroup = useCallback((gid: number, updates: Partial<Group>) => {
    useGraphStore.setState(s => ({
      groups: s.groups.map(g => g.id === gid ? { ...g, ...updates } : g),
    }));
  }, []);

  const addNodeToGroup = useCallback((nodeId: number, gid: number) => {
    const { groups } = useGraphStore.getState();
    const g = groups.find(x => x.id === gid);
    if (!g || g.nodeIds.includes(nodeId)) return;
    store.pushUndo();
    useGraphStore.setState(s => ({
      groups: s.groups.map(g => g.id === gid ? { ...g, nodeIds: [...g.nodeIds, nodeId] } : g),
      nodes: s.nodes.map(n => n.id === nodeId ? { ...n, groupId: gid } : n),
    }));
    void saveGraph();
  }, [store, saveGraph]);

  const collapseGroup = useCallback((gid: number) => {
    store.pushUndo();
    const { nodes, groups } = useGraphStore.getState();
    const group = groups.find(g => g.id === gid);
    if (!group || group.collapsed) return;
    const memberNodes = nodes.filter(n => group.nodeIds.includes(n.id));
    const savedPositions: Record<number, { x: number; y: number }> = {};
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    memberNodes.forEach(n => {
      savedPositions[n.id] = { x: n.x, y: n.y };
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + 150);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + 50);
    });
    const cw = group.collapsedW || 160, ch = group.collapsedH || 60;
    const cx = (minX + maxX) / 2 - cw / 2;
    const cy = (minY + maxY) / 2 - ch / 2;
    updateGroup(gid, { collapsed: true, savedPositions, collapsedX: cx, collapsedY: cy });
    void saveGraph();
  }, [store, updateGroup, saveGraph]);

  const expandGroup = useCallback((gid: number) => {
    const { groups, nodes } = useGraphStore.getState();
    const group = groups.find(g => g.id === gid);
    if (!group || !group.collapsed) return;
    const newNodes = nodes.map(n => {
      if (group.nodeIds.includes(n.id) && group.savedPositions?.[n.id]) {
        return { ...n, ...group.savedPositions[n.id] };
      }
      return n;
    });
    useGraphStore.setState(s => ({
      nodes: newNodes,
      groups: s.groups.map(g => g.id === gid ? { ...g, collapsed: false, savedPositions: undefined } : g),
    }));
    void saveGraph();
  }, [saveGraph]);

  const linkSelectedNodes = useCallback(() => {
    const { nodes } = useGraphStore.getState();
    const sel = nodes.filter(n => n.selected);
    if (sel.length < 2) return;
    store.pushUndo();
    for (let i = 0; i < sel.length - 1; i++) addLinkDirect(sel[i].id, sel[i + 1].id);
    void saveGraph();
  }, [store, addLinkDirect, saveGraph]);

  const splitSelectedLinks = useCallback(() => {
    const { nodes, links } = useGraphStore.getState();
    const sel = new Set(nodes.filter(n => n.selected).map(n => n.id));
    if (sel.size < 2) return;
    store.pushUndo();
    useGraphStore.setState({ links: links.filter(l => !(sel.has(l.sourceId) && sel.has(l.targetId))) });
    void saveGraph();
  }, [store, saveGraph]);

  const selectNode = useCallback((id: number, multi = false) => {
    useGraphStore.setState(s => ({
      nodes: s.nodes.map(n => ({
        ...n,
        selected: n.id === id ? true : multi ? n.selected : false,
      })),
    }));
  }, []);

  const deselectAll = useCallback(() => {
    useGraphStore.setState(s => ({ explicitlyDeselected: true, nodes: s.nodes.map(n => ({ ...n, selected: false })) }));
  }, []);

  const autoLayout = useCallback(() => {
    store.pushUndo();
    const { nodes, links } = useGraphStore.getState();
    const visited = new Set<number>();
    const components: number[][] = [];
    const adjMap = new Map<number, number[]>();
    nodes.forEach(n => adjMap.set(n.id, []));
    links.forEach(l => {
      adjMap.get(l.sourceId)?.push(l.targetId);
      adjMap.get(l.targetId)?.push(l.sourceId);
    });
    const bfs = (startId: number) => {
      const comp: number[] = [];
      const q = [startId];
      visited.add(startId);
      while (q.length) {
        const id = q.shift()!;
        comp.push(id);
        (adjMap.get(id) || []).forEach(nb => {
          if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
        });
      }
      return comp;
    };
    nodes.forEach(n => { if (!visited.has(n.id)) components.push(bfs(n.id)); });

    const COL_GAP = 340, ROW_GAP = 120, COMP_GAP_Y = 80;
    let gOffX = ORIGIN_X, gOffY = ORIGIN_Y;
    const positions: Record<number, { x: number; y: number }> = {};

    components.forEach(comp => {
      if (!comp.length) return;
      if (comp.length === 1) {
        positions[comp[0]] = { x: gOffX, y: gOffY };
        gOffY += ROW_GAP + COMP_GAP_Y;
        return;
      }
      const roots = comp.filter(id => nodes.find(n => n.id === id)?.type === 'question');
      const root = roots.length ? roots[0] : comp[0];
      const depth = new Map<number, number>();
      const children = new Map<number, number[]>();
      comp.forEach(id => children.set(id, []));
      const bfsQ = [root]; const vis2 = new Set([root]); depth.set(root, 0);
      while (bfsQ.length) {
        const cur = bfsQ.shift()!;
        links.forEach(l => {
          let nb: number | null = null;
          if (l.sourceId === cur && comp.includes(l.targetId)) nb = l.targetId;
          else if (l.targetId === cur && comp.includes(l.sourceId)) nb = l.sourceId;
          if (nb !== null && !vis2.has(nb)) {
            vis2.add(nb); depth.set(nb, (depth.get(cur) || 0) + 1);
            children.get(cur)?.push(nb); bfsQ.push(nb);
          }
        });
      }
      const sh = new Map<number, number>();
      const calcSH = (id: number): number => {
        const kids = children.get(id) || [];
        if (!kids.length) { sh.set(id, 1); return 1; }
        const s = kids.reduce((a, k) => a + calcSH(k), 0);
        sh.set(id, s); return s;
      };
      calcSH(root);
      const assign = (id: number, top: number) => {
        const kids = children.get(id) || [];
        const d = depth.get(id) || 0;
        const totalH = (sh.get(id)! - 1) * ROW_GAP;
        const cy = top + totalH / 2;
        positions[id] = { x: gOffX + d * COL_GAP, y: cy };
        let ct = top;
        kids.forEach(k => { assign(k, ct); ct += sh.get(k)! * ROW_GAP; });
      };
      assign(root, gOffY);
      const maxY = Math.max(...comp.map(id => positions[id]?.y ?? gOffY));
      gOffY = maxY + ROW_GAP + COMP_GAP_Y;
    });

    useGraphStore.setState(s => ({
      nodes: s.nodes.map(n => positions[n.id] ? { ...n, ...positions[n.id] } : n)
    }));
    void saveGraph();
    setTimeout(() => window.dispatchEvent(new Event('canvas:recenter')), 60);
  }, [store, saveGraph]);

  return {
    saveGraph, addNode, updateNode, deleteNode, addLink, deleteLink,
    mergeNodes, createGroup, deleteGroup, updateGroup, addNodeToGroup,
    collapseGroup, expandGroup, linkSelectedNodes, splitSelectedLinks,
    selectNode, deselectAll, dimAllNodes, getSmartSpawnPos, autoLayout,
    GROUP_COLORS,
  };
}
