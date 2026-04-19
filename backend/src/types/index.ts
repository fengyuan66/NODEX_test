// Shared TypeScript interfaces for the NODEX backend

export interface GraphNode {
  id: number;
  type: 'question' | 'answer' | 'note' | 'timer' | 'brainstorm';
  text: string;
  x: number;
  y: number;
  groupId?: number;
  selected?: boolean;
  completed?: boolean;
  meta?: {
    totalSeconds?: number;
    remaining?: number;
    running?: number; // timestamp when started
    title?: string;
    body?: string;
    topic?: string;
  };
}

export interface Link {
  id: number;
  sourceId: number;
  targetId: number;
}

export interface Group {
  id: number;
  name: string;
  color: string;
  nodeIds: number[];
  collapsed: boolean;
  collapsedW?: number;
  collapsedH?: number;
  collapsedX?: number | null;
  collapsedY?: number | null;
  savedPositions?: Record<number, { x: number; y: number }>;
}

export interface GraphData {
  nodes: GraphNode[];
  links: Link[];
  groups: Group[];
  nextNodeId: number;
  nextLinkId: number;
  nextGroupId: number;
}

export interface User {
  id: number;
  email: string;
}

// Extend express-session to include our fields
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    email?: string;
    nextUrl?: string;
  }
}
