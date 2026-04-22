import type { GraphNode, SidebarChatMessage } from '../types';

export function chatHistoryFromMeta(meta: GraphNode['meta'] | undefined): SidebarChatMessage[] {
  const h = meta?.chatHistory;
  if (!Array.isArray(h)) return [];
  return h.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
}

export function previewChatLabel(history: SidebarChatMessage[]): string {
  if (!history.length) return 'New chat';
  const last = history[history.length - 1];
  const snippet = (last.content || '').replace(/\s+/g, ' ').trim().slice(0, 72);
  return snippet || `Chat (${history.length} msgs)`;
}

/** Text block used when this node is included in AI context (selection or last-node fallback). */
export function nodeTextForContext(n: GraphNode): string {
  if (n.type === 'chat') {
    const hist = chatHistoryFromMeta(n.meta);
    if (hist.length) {
      return `Chat:\n${hist.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}`;
    }
    return '(empty chat)';
  }
  return n.text || '';
}

export function buildGraphContextPayload(nodes: GraphNode[], lastNodeId: number | null): string {
  const sel = nodes.filter(n => n.selected);
  if (!sel.length) {
    if (lastNodeId !== null) {
      const l = nodes.find(n => n.id === lastNodeId);
      if (l && l.type !== 'question') return nodeTextForContext(l);
    }
    return '';
  }
  return sel.map(nodeTextForContext).join('\n---\n');
}

/** Canvas context for API calls from inside a chat node — omits that node from selection/last fallback. */
export function buildContextExcludingNode(excludeId: number, nodes: GraphNode[], lastNodeId: number | null): string {
  const sel = nodes.filter(n => n.selected && n.id !== excludeId);
  if (sel.length) return sel.map(nodeTextForContext).join('\n---\n');
  if (lastNodeId !== null && lastNodeId !== excludeId) {
    const l = nodes.find(n => n.id === lastNodeId);
    if (l && l.type !== 'question') return nodeTextForContext(l);
  }
  return '';
}
