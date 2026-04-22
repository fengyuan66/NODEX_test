import { useEffect, useMemo, useRef, useState } from 'react';
import { aiApi } from '../../api/client';
import { useGraphStore } from '../../store/graphStore';
import { apiErrorMessage } from '../../utils/apiError';
import {
  buildContextExcludingNode,
  chatHistoryFromMeta,
  previewChatLabel,
} from '../../utils/graphContext';

interface ChatPanelProps {
  nodeId: number;
  mode: 'node' | 'sidebar';
  onSave: () => void;
  onClose: () => void;
  onSwitchMode: () => void;
}

export default function ChatPanel({ nodeId, mode, onSave, onClose, onSwitchMode }: ChatPanelProps) {
  const node = useGraphStore((state) => state.nodes.find((entry) => entry.id === nodeId && entry.type === 'chat'));
  const [chatBusy, setChatBusy] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [nodeId, mode]);

  const history = useMemo(() => chatHistoryFromMeta(node?.meta), [node?.meta]);

  if (!node) return null;

  const sendChatFromNode = async () => {
    const trimmed = chatDraft.trim();
    if (!trimmed || chatBusy) return;

    const fresh = useGraphStore.getState().nodes.find((entry) => entry.id === node.id);
    const prior = chatHistoryFromMeta(fresh?.meta);
    const pending = [...prior, { role: 'user' as const, content: trimmed }];

    setChatDraft('');
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map((entry) =>
        entry.id === node.id
          ? { ...entry, meta: { ...entry.meta, chatHistory: pending }, text: previewChatLabel(pending) }
          : entry
      ),
    }));
    onSave();

    setChatBusy(true);
    try {
      const transcriptBefore = pending
        .slice(0, -1)
        .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
        .join('\n\n');
      const { nodes: allNodes, lastNodeId } = useGraphStore.getState();
      const canvasCtx = buildContextExcludingNode(node.id, allNodes, lastNodeId);
      const parts: string[] = [];
      if (canvasCtx) parts.push('Canvas reference:\n' + canvasCtx);
      if (transcriptBefore) parts.push('Earlier in this chat:\n' + transcriptBefore);
      const context = parts.join('\n---\n');
      const response = await aiApi.chat(trimmed, context);
      const after = [...pending, { role: 'assistant' as const, content: response.data.reply || '' }];
      useGraphStore.setState((state) => ({
        nodes: state.nodes.map((entry) =>
          entry.id === node.id
            ? { ...entry, meta: { ...entry.meta, chatHistory: after }, text: previewChatLabel(after) }
            : entry
        ),
      }));
      onSave();
    } catch (error) {
      alert(apiErrorMessage(error, 'Chat failed.'));
      useGraphStore.setState((state) => ({
        nodes: state.nodes.map((entry) =>
          entry.id === node.id
            ? { ...entry, meta: { ...entry.meta, chatHistory: prior }, text: previewChatLabel(prior) }
            : entry
        ),
      }));
      onSave();
    } finally {
      setChatBusy(false);
    }
  };

  const handleClear = () => {
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map((entry) =>
        entry.id === node.id ? { ...entry, meta: { ...entry.meta, chatHistory: [] }, text: 'New chat' } : entry
      ),
    }));
    onSave();
    setChatDraft('');
    inputRef.current?.focus();
  };

  return (
    <div className={mode === 'sidebar' ? 'chat-sidebar-panel' : 'chat-wrap bubble'} onMouseDown={e => e.stopPropagation()}>
      <div className="chat-wrap-head">
        <button type="button" className="chat-wrap-btn" onClick={onClose}>Close</button>
        <button type="button" className="chat-wrap-btn" onClick={onSwitchMode}>
          {mode === 'sidebar' ? 'Dock To Node' : 'Open Sidebar'}
        </button>
        <button type="button" className="chat-wrap-btn" disabled={chatBusy || !history.length} onClick={handleClear}>
          Clear
        </button>
      </div>
      <div className="chat-wrap-msgs">
        {history.map((message, index) => (
          <div key={index} className={`chat-wrap-line chat-wrap-${message.role}`}>
            <span className="chat-wrap-role">{message.role === 'user' ? 'You' : 'Model'}</span>
            <span className="chat-wrap-txt">{message.content}</span>
          </div>
        ))}
        {chatBusy && <div className="chat-wrap-line chat-wrap-assistant muted">...</div>}
      </div>
      <div className="chat-wrap-inputrow">
        <textarea
          ref={inputRef}
          className="chat-wrap-input"
          rows={mode === 'sidebar' ? 3 : 2}
          placeholder="Message..."
          value={chatDraft}
          disabled={chatBusy}
          onChange={e => setChatDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendChatFromNode();
            }
          }}
        />
        <button
          type="button"
          className="chat-wrap-send"
          disabled={chatBusy || !chatDraft.trim()}
          onClick={() => void sendChatFromNode()}
        >
          ^
        </button>
      </div>
    </div>
  );
}
