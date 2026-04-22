import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { GraphNode } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { aiApi } from '../../api/client';
import { apiErrorMessage } from '../../utils/apiError';
import {
  buildContextExcludingNode,
  chatHistoryFromMeta,
  previewChatLabel,
} from '../../utils/graphContext';

interface NodeProps {
  node: GraphNode;
  onMoveStart: (id: number, e: React.MouseEvent) => void;
  onTextChange: (id: number, text: string) => void;
  emitNodeText?: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onAddLink: (sourceId: number, targetId: number) => void;
  onSave: () => void;
}

// ── Timer Ring Component ──────────────────────────────────────────────────────
function TimerRing({ node, onSave }: { node: GraphNode; onSave: () => void }) {
  const total = node.meta?.seconds || 0;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const circumference = 2 * Math.PI * 16;

  const progress = total > 0 ? Math.max(0, remaining / total) : 0;
  const offset = circumference * (1 - progress);

  const formatTime = (s: number) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const start = () => {
    if (running || remaining <= 0) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          useGraphStore.setState(s => ({
            nodes: s.nodes.map(n => n.id === node.id ? { ...n, completed: true } : n)
          }));
          onSave();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const strokeColor = remaining <= 0 ? '#3b82f6' : 'url(#timerGradient)';

  return (
    <div className="timer-ring" onClick={start} style={{ cursor: running ? 'default' : 'pointer' }} title="Click to start">
      <svg viewBox="0 0 40 40">
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981"/>
            <stop offset="50%" stopColor="#7c3aed"/>
            <stop offset="100%" stopColor="#a78bfa"/>
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="20" cy="20" r="16"/>
        <circle
          className="ring-progress" cx="20" cy="20" r="16"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            stroke: strokeColor,
          }}
        />
      </svg>
      <div className="timer-text">{formatTime(remaining)}</div>
    </div>
  );
}

// ── Main Node Component ───────────────────────────────────────────────────────
export default function Node({ node, onMoveStart, onTextChange, emitNodeText, onDelete, onSave }: NodeProps) {
  const [localText, setLocalText] = useState(node.text);
  const [localTitle, setLocalTitle] = useState(node.meta?.title || '');
  const [localTopic, setLocalTopic] = useState(node.meta?.topic || '');
  const [brainstormRunning, setBrainstormRunning] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const dimClass = `dim-${node.dim || 0}`;

  useEffect(() => {
    if (document.activeElement?.getAttribute('data-node-id') !== String(node.id)) {
      setLocalText(node.text);
      setLocalTitle(node.meta?.title || '');
      setLocalTopic(node.meta?.topic || '');
    }
  }, [node.text, node.meta, node.id]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      if (document.activeElement === target) return;
    }
    if (target.classList.contains('group-resize-handle')) return;
    e.stopPropagation();
    onMoveStart(node.id, e);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      onDelete(node.id);
      return;
    }
    if (!e.shiftKey) {
      useGraphStore.setState(s => ({
        nodes: s.nodes.map(n => n.id === node.id ? { ...n, selected: !n.selected } : n)
      }));
    }
  };

  const sendChatFromNode = useCallback(async () => {
    if (node.type !== 'chat') return;
    const trimmed = chatDraft.trim();
    if (!trimmed || chatBusy) return;
    const fresh = useGraphStore.getState().nodes.find(n => n.id === node.id);
    const prior = chatHistoryFromMeta(fresh?.meta);
    const pending = [...prior, { role: 'user' as const, content: trimmed }];
    setChatDraft('');
    useGraphStore.setState(s => ({
      nodes: s.nodes.map(n =>
        n.id === node.id
          ? { ...n, meta: { ...n.meta, chatHistory: pending }, text: previewChatLabel(pending) }
          : n
      ),
    }));
    onSave();
    setChatBusy(true);
    try {
      const transcriptBefore = pending
        .slice(0, -1)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const { nodes: allNodes, lastNodeId } = useGraphStore.getState();
      const canvasCtx = buildContextExcludingNode(node.id, allNodes, lastNodeId);
      const parts: string[] = [];
      if (canvasCtx) parts.push('Canvas reference:\n' + canvasCtx);
      if (transcriptBefore) parts.push('Earlier in this chat:\n' + transcriptBefore);
      const context = parts.join('\n---\n');
      const r = await aiApi.chat(trimmed, context);
      const after = [...pending, { role: 'assistant' as const, content: r.data.reply || '' }];
      useGraphStore.setState(s => ({
        nodes: s.nodes.map(n =>
          n.id === node.id
            ? { ...n, meta: { ...n.meta, chatHistory: after }, text: previewChatLabel(after) }
            : n
        ),
      }));
      onSave();
    } catch (e) {
      alert(apiErrorMessage(e, 'Chat failed.'));
      useGraphStore.setState(s => ({
        nodes: s.nodes.map(n =>
          n.id === node.id ? { ...n, meta: { ...n.meta, chatHistory: prior }, text: previewChatLabel(prior) } : n
        ),
      }));
      onSave();
    } finally {
      setChatBusy(false);
    }
  }, [node.type, node.id, chatDraft, chatBusy, onSave]);

  const typeClass = `node-${node.type}`;
  const selectedClass = node.selected ? 'selected' : '';
  const completedClass = node.completed ? 'completed' : '';

  const renderContent = () => {
    if (node.type === 'answer') {
      const width = node.meta?.w ? `${node.meta.w}px` : undefined;
      const height = node.meta?.h ? `${node.meta.h}px` : undefined;
      return (
        <div className="node-text">
          <div className="bubble" style={{ width, height }}>
            <div className="bubble-header">
              <button
                className="copy-btn"
                onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(node.text || '').catch(() => {}); }}
              >Copy</button>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              data-node-id={node.id}
              onInput={e => {
                const text = e.currentTarget.innerText;
                setLocalText(text);
                onTextChange(node.id, text);
                if (emitNodeText) emitNodeText(node.id, text);
              }}
              onBlur={onSave}
              style={{ outline: 'none', minWidth: '50px' }}
            >{localText}</div>
          </div>
        </div>
      );
    }

    if (node.type === 'timer') {
      return (
        <div className="node-text">
          <TimerRing node={node} onSave={onSave} />
        </div>
      );
    }

    if (node.type === 'note') {
      const width = node.meta?.w ? `${node.meta.w}px` : undefined;
      const height = node.meta?.h ? `${node.meta.h}px` : undefined;
      return (
        <div className="node-text">
          <div className="note-wrap">
            <input
              className="note-title"
              placeholder="Title…"
              value={localTitle}
              data-node-id={node.id}
              onMouseDown={e => { if (document.activeElement === e.target) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); (e.target as HTMLElement).focus(); }}
              onChange={e => {
                setLocalTitle(e.target.value);
                useGraphStore.setState(s => ({
                  nodes: s.nodes.map(n => n.id === node.id ? { ...n, meta: { ...n.meta, title: e.target.value } } : n)
                }));
              }}
              onBlur={onSave}
            />
            <textarea
              className="note-body"
              placeholder="Write anything…"
              value={localText}
              style={{ width, height }}
              data-node-id={node.id}
              onMouseDown={e => { if (document.activeElement === e.target) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); (e.target as HTMLElement).focus(); }}
              onChange={e => {
                setLocalText(e.target.value);
                onTextChange(node.id, e.target.value);
                if (emitNodeText) emitNodeText(node.id, e.target.value);
              }}
              onKeyDown={e => e.stopPropagation()}
              onBlur={onSave}
            />
          </div>
        </div>
      );
    }

    if (node.type === 'chat') {
      const history = chatHistoryFromMeta(node.meta);
      const label = previewChatLabel(history);

      if (!chatPanelOpen) {
        return (
          <div className="node-text" title="Double-click node to open chat">
            <div className="chat-compact bubble">
              <div className="chat-compact-hint">Double-click to continue</div>
              <div className="chat-compact-body">{label}</div>
            </div>
          </div>
        );
      }

      return (
        <div className="node-text" onMouseDown={e => e.stopPropagation()}>
          <div className="chat-wrap bubble">
            <div className="chat-wrap-head">
              <button type="button" className="chat-wrap-btn" onClick={() => setChatPanelOpen(false)}>Close</button>
              <button
                type="button"
                className="chat-wrap-btn"
                disabled={chatBusy || !history.length}
                onClick={() => {
                  useGraphStore.setState(s => ({
                    nodes: s.nodes.map(n =>
                      n.id === node.id ? { ...n, meta: { ...n.meta, chatHistory: [] }, text: 'New chat' } : n
                    ),
                  }));
                  onSave();
                }}
              >
                Clear
              </button>
            </div>
            <div className="chat-wrap-msgs">
              {history.map((m, i) => (
                <div key={i} className={`chat-wrap-line chat-wrap-${m.role}`}>
                  <span className="chat-wrap-role">{m.role === 'user' ? 'You' : 'Model'}</span>
                  <span className="chat-wrap-txt">{m.content}</span>
                </div>
              ))}
              {chatBusy && <div className="chat-wrap-line chat-wrap-assistant muted">…</div>}
            </div>
            <div className="chat-wrap-inputrow">
              <textarea
                className="chat-wrap-input"
                rows={2}
                placeholder="Message…"
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
              <button type="button" className="chat-wrap-send" disabled={chatBusy || !chatDraft.trim()} onClick={() => void sendChatFromNode()}>
                ↑
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (node.type === 'brainstorm') {
      return (
        <div className="node-text">
          <div className="brainstorm-wrap">
            <textarea
              className="brainstorm-input"
              placeholder="Topic..."
              value={localTopic}
              data-node-id={node.id}
              onMouseDown={e => { if (document.activeElement === e.target) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); (e.target as HTMLElement).focus(); }}
              onChange={e => {
                setLocalTopic(e.target.value);
                useGraphStore.setState(s => ({
                  nodes: s.nodes.map(n => n.id === node.id ? { ...n, meta: { ...n.meta, topic: e.target.value } } : n)
                }));
              }}
              onKeyDown={e => e.stopPropagation()}
              onBlur={onSave}
            />
            <button
              className="brainstorm-run"
              disabled={brainstormRunning}
              onClick={async e => {
                e.stopPropagation();
                const topic = localTopic.trim();
                if (!topic) return;
                setBrainstormRunning(true);
                try {
                  const r = await aiApi.brainstorm(topic);
                  const ideas = r.data.nodes || [];
                  const startY = node.y - ((ideas.length - 1) * 70) / 2;
                  // Dispatch event so CanvasPage can handle node creation
                  window.dispatchEvent(new CustomEvent('brainstorm:results', {
                    detail: { sourceId: node.id, ideas, startX: node.x + 320, startY }
                  }));
                } catch (e) {
                  alert(apiErrorMessage(e, 'Brainstorm failed.'));
                  console.error('[brainstorm]', e);
                }
                setBrainstormRunning(false);
              }}
            >{brainstormRunning ? 'Running...' : 'Run'}</button>
          </div>
        </div>
      );
    }

    // question / default
    return (
      <div
        className="node-text"
        contentEditable
        suppressContentEditableWarning
        data-node-id={node.id}
        onInput={e => {
          const text = e.currentTarget.innerText;
          setLocalText(text);
          onTextChange(node.id, text);
          if (emitNodeText) emitNodeText(node.id, text);
        }}
        onBlur={onSave}
        style={{ outline: 'none', minWidth: '50px' }}
      >{localText}</div>
    );
  };

  return (
    <div
      className={`node ${typeClass} ${selectedClass} ${completedClass} ${dimClass}`}
      data-id={node.id}
      style={{ left: node.x, top: node.y }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={e => {
        if (node.type !== 'chat' || chatPanelOpen) return;
        e.stopPropagation();
        setChatPanelOpen(true);
      }}
    >
      <div className="node-circle" />
      {renderContent()}
    </div>
  );
}
