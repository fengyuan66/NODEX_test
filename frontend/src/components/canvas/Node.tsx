import React, { useEffect, useRef, useState } from 'react';
import type { GraphNode } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { aiApi } from '../../api/client';
import { apiErrorMessage } from '../../utils/apiError';
import { chatHistoryFromMeta, previewChatLabel } from '../../utils/graphContext';
import ChatPanel from '../chat/ChatPanel';
import LinkedText from '../ui/LinkedText';

interface NodeProps {
  node: GraphNode;
  onMoveStart: (id: number, e: React.MouseEvent) => void;
  onTextChange: (id: number, text: string) => void;
  emitNodeText?: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onAddLink: (sourceId: number, targetId: number) => void;
  onToggleChat: (id: number) => void;
  onSave: () => void;
}

function TimerRing({ node, onSave }: { node: GraphNode; onSave: () => void }) {
  const total = node.meta?.seconds || 0;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const circumference = 2 * Math.PI * 16;

  const progress = total > 0 ? Math.max(0, remaining / total) : 0;
  const offset = circumference * (1 - progress);

  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const start = () => {
    if (running || remaining <= 0) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          useGraphStore.setState((state) => ({
            nodes: state.nodes.map((entry) => entry.id === node.id ? { ...entry, completed: true } : entry),
          }));
          onSave();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const strokeColor = remaining <= 0 ? '#3b82f6' : 'url(#timerGradient)';

  return (
    <div className="timer-ring" onClick={start} style={{ cursor: running ? 'default' : 'pointer' }} title="Click to start">
      <svg viewBox="0 0 40 40">
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="20" cy="20" r="16" />
        <circle
          className="ring-progress"
          cx="20"
          cy="20"
          r="16"
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

export default function Node({ node, onMoveStart, onTextChange, emitNodeText, onDelete, onToggleChat, onSave }: NodeProps) {
  const [localText, setLocalText] = useState(node.text);
  const [localTitle, setLocalTitle] = useState(node.meta?.title || '');
  const [localTopic, setLocalTopic] = useState(node.meta?.topic || '');
  const [answerEditing, setAnswerEditing] = useState(false);
  const [brainstormRunning, setBrainstormRunning] = useState(false);
  const activeChatNodeId = useGraphStore((state) => state.activeChatNodeId);
  const activeChatView = useGraphStore((state) => state.activeChatView);
  const chatPanelOpen = node.type === 'chat' && activeChatNodeId === node.id && activeChatView === 'node';
  const dimClass = `dim-${node.dim || 0}`;

  useEffect(() => {
    if (document.activeElement?.getAttribute('data-node-id') !== String(node.id)) {
      setLocalText(node.text);
      setLocalTitle(node.meta?.title || '');
      setLocalTopic(node.meta?.topic || '');
    }
  }, [node.text, node.meta, node.id]);

  useEffect(() => {
    if (node.type !== 'answer') setAnswerEditing(false);
  }, [node.id, node.type]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'A') {
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
      useGraphStore.setState((state) => ({
        nodes: state.nodes.map((entry) => entry.id === node.id ? { ...entry, selected: !entry.selected } : entry),
      }));
    }
  };

  const typeClass = `node-${node.type}`;
  const selectedClass = node.selected ? 'selected' : '';
  const completedClass = node.completed ? 'completed' : '';
  const modeButton = (
    <button
      type="button"
      className="copy-btn"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        onToggleChat(node.id);
      }}
    >
      {node.type === 'chat' ? 'Freeze' : 'Chat'}
    </button>
  );

  const renderContent = () => {
    if (node.type === 'answer') {
      const width = node.meta?.w ? `${node.meta.w}px` : undefined;
      const height = node.meta?.h ? `${node.meta.h}px` : undefined;
      return (
        <div className="node-text">
          <div className="bubble" style={{ width, height }}>
            <div className="bubble-header">
              {modeButton}
              <button
                className="copy-btn"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  setAnswerEditing((value) => !value);
                }}
              >
                {answerEditing ? 'Done' : 'Edit'}
              </button>
              <button
                className="copy-btn"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(node.text || '').catch(() => {});
                }}
              >
                Copy
              </button>
            </div>
            {answerEditing ? (
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
                onBlur={() => {
                  onSave();
                  setAnswerEditing(false);
                }}
                style={{ outline: 'none', minWidth: '50px' }}
              >
                {localText}
              </div>
            ) : (
              <div
                className="answer-rich-text"
                onDoubleClick={e => {
                  e.stopPropagation();
                  setAnswerEditing(true);
                }}
              >
                <LinkedText text={localText} className="node-linked-text" />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (node.type === 'timer') {
      return (
        <div className="node-text">
          <TimerRing node={node} onSave={onSave} />
          <div className="node-inline-actions">
            {modeButton}
          </div>
        </div>
      );
    }

    if (node.type === 'note') {
      const width = node.meta?.w ? `${node.meta.w}px` : undefined;
      const height = node.meta?.h ? `${node.meta.h}px` : undefined;
      return (
        <div className="node-text">
          <div className="note-wrap">
            <div className="node-inline-actions">
              {modeButton}
            </div>
            <input
              className="note-title"
              placeholder="Title..."
              value={localTitle}
              data-node-id={node.id}
              onMouseDown={e => { if (document.activeElement === e.target) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); (e.target as HTMLElement).focus(); }}
              onChange={e => {
                setLocalTitle(e.target.value);
                useGraphStore.setState((state) => ({
                  nodes: state.nodes.map((entry) =>
                    entry.id === node.id ? { ...entry, meta: { ...entry.meta, title: e.target.value } } : entry
                  ),
                }));
              }}
              onBlur={onSave}
            />
            <textarea
              className="note-body"
              placeholder="Write anything..."
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
              <div className="bubble-header">
                {modeButton}
              </div>
              <div className="chat-compact-hint">Double-click to continue</div>
              <div className="chat-compact-body">{label}</div>
            </div>
          </div>
        );
      }

      return (
        <div className="node-text">
          <div className="node-inline-actions">
            {modeButton}
          </div>
          <ChatPanel
            nodeId={node.id}
            mode="node"
            onSave={onSave}
            onClose={() => useGraphStore.getState().setActiveChat(null, 'node')}
            onSwitchMode={() => useGraphStore.getState().setActiveChat(node.id, 'sidebar')}
          />
        </div>
      );
    }

    if (node.type === 'brainstorm') {
      return (
        <div className="node-text">
          <div className="brainstorm-wrap">
            <div className="node-inline-actions">
              {modeButton}
            </div>
            <textarea
              className="brainstorm-input"
              placeholder="Topic..."
              value={localTopic}
              data-node-id={node.id}
              onMouseDown={e => { if (document.activeElement === e.target) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); (e.target as HTMLElement).focus(); }}
              onChange={e => {
                setLocalTopic(e.target.value);
                useGraphStore.setState((state) => ({
                  nodes: state.nodes.map((entry) =>
                    entry.id === node.id ? { ...entry, meta: { ...entry.meta, topic: e.target.value } } : entry
                  ),
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
                  const response = await aiApi.brainstorm(topic);
                  const ideas = response.data.nodes || [];
                  const startY = node.y - ((ideas.length - 1) * 70) / 2;
                  window.dispatchEvent(new CustomEvent('brainstorm:results', {
                    detail: { sourceId: node.id, ideas, startX: node.x + 320, startY },
                  }));
                } catch (error) {
                  alert(apiErrorMessage(error, 'Brainstorm failed.'));
                  console.error('[brainstorm]', error);
                }
                setBrainstormRunning(false);
              }}
            >
              {brainstormRunning ? 'Running...' : 'Run'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="node-text">
        <div className="node-inline-actions">
          {modeButton}
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
        >
          {localText}
        </div>
      </div>
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
        useGraphStore.getState().setActiveChat(node.id, 'node');
      }}
    >
      <div className="node-circle" />
      {renderContent()}
    </div>
  );
}
