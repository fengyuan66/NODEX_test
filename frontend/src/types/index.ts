export interface GraphNode {
  id: number;
  type: 'question' | 'answer' | 'note' | 'timer' | 'brainstorm' | 'chat';
  text: string;
  x: number;
  y: number;
  groupId?: number;
  selected?: boolean;
  completed?: boolean;
  dim?: number;
  meta: {
    seconds?: number;
    title?: string;
    topic?: string;
    w?: number | null;
    h?: number | null;
    label?: string;
    /** Linear chat thread stored on canvas chat nodes */
    chatHistory?: SidebarChatMessage[];
    /** Last non-chat type before this node was converted into a chat node */
    frozenFromType?: Exclude<GraphNode['type'], 'chat'>;
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

export interface SidebarChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PresenceUser {
  email: string;
  color: string;
}

export interface RemoteCursorData {
  id: string;
  x: number;
  y: number;
  email: string;
  color: string;
}
