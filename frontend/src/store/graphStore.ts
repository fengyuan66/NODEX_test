import { create } from 'zustand';
import type { GraphNode, Link, Group } from '../types';

const MAX_HISTORY = 80;

interface GraphState {
  nodes: GraphNode[];
  links: Link[];
  groups: Group[];
  nextNodeId: number;
  nextLinkId: number;
  nextGroupId: number;
  currentScale: number;
  activeChatNodeId: number | null;
  activeChatView: 'node' | 'sidebar';
  undoStack: string[];
  redoStack: string[];
  lastNodeId: number | null;
  explicitlyDeselected: boolean;
  // Actions
  setGraph: (data: { nodes: GraphNode[]; links: Link[]; groups: Group[]; nextNodeId: number; nextLinkId: number; nextGroupId: number }) => void;
  setNodes: (nodes: GraphNode[]) => void;
  setLinks: (links: Link[]) => void;
  setGroups: (groups: Group[]) => void;
  setScale: (scale: number) => void;
  setActiveChat: (nodeId: number | null, view?: 'node' | 'sidebar') => void;
  setLastNodeId: (id: number | null) => void;
  setExplicitlyDeselected: (b: boolean) => void;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  snapshot: () => string;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  links: [],
  groups: [],
  nextNodeId: 1,
  nextLinkId: 1,
  nextGroupId: 1,
  currentScale: 1,
  activeChatNodeId: null,
  activeChatView: 'node',
  undoStack: [],
  redoStack: [],
  lastNodeId: null,
  explicitlyDeselected: false,

  setGraph: (data) => set({
    nodes: data.nodes,
    links: data.links,
    groups: data.groups,
    nextNodeId: data.nextNodeId,
    nextLinkId: data.nextLinkId,
    nextGroupId: data.nextGroupId,
  }),

  setNodes: (nodes) => set({ nodes }),
  setLinks: (links) => set({ links }),
  setGroups: (groups) => set({ groups }),
  setScale: (scale) => set({ currentScale: scale }),
  setActiveChat: (nodeId, view = 'node') => set({
    activeChatNodeId: nodeId,
    activeChatView: view,
  }),
  setLastNodeId: (id) => set({ lastNodeId: id }),
  setExplicitlyDeselected: (b) => set({ explicitlyDeselected: b }),

  snapshot: () => {
    const { nodes, links, groups, nextNodeId, nextLinkId, nextGroupId } = get();
    return JSON.stringify({ nodes, links, groups, nextNodeId, nextLinkId, nextGroupId });
  },

  pushUndo: () => {
    const snap = get().snapshot();
    set(state => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY + 1), snap],
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack, snapshot } = get();
    if (!undoStack.length) return;
    const current = snapshot();
    const prev = undoStack[undoStack.length - 1];
    const data = JSON.parse(prev);
    set(state => ({
      ...data,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
    }));
  },

  redo: () => {
    const { redoStack, snapshot } = get();
    if (!redoStack.length) return;
    const current = snapshot();
    const next = redoStack[redoStack.length - 1];
    const data = JSON.parse(next);
    set(state => ({
      ...data,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, current],
    }));
  },
}));
