import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { graphApi, aiApi } from '../api/client';
import { useGraphStore } from '../store/graphStore';
import { useGraph } from '../hooks/useGraph';
import { useSocket } from '../hooks/useSocket';
import { useKeyboard } from '../hooks/useKeyboard';

import Canvas from '../components/canvas/Canvas';
import TopBar from '../components/ui/TopBar';
import InputBar from '../components/ui/InputBar';
import ZoomControls from '../components/ui/ZoomControls';
import SuggestionsBar from '../components/ui/SuggestionsBar';
import ColorPicker from '../components/ui/ColorPicker';
import PresenceBar from '../components/presence/PresenceBar';
import SettingsModal from '../components/ui/modals/SettingsModal';
import ShareModal from '../components/ui/modals/ShareModal';
import DashboardModal from '../components/ui/modals/DashboardModal';

import type { PresenceUser } from '../types';

interface CanvasPageProps {
  isShared: boolean;
}

export default function CanvasPage({ isShared }: CanvasPageProps) {
  const { shareId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [ownShareId, setOwnShareId] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const {
    addNode, addLink, deleteNode, dimAllNodes, saveGraph,
    linkSelectedNodes, splitSelectedLinks, autoLayout, getSmartSpawnPos,
    createGroup, updateGroup
  } = useGraph();

  useSocket({ shareId: isShared ? shareId : undefined, onPresenceUpdate: setPresenceUsers });
  useKeyboard(linkSelectedNodes, splitSelectedLinks, () => triggerGroupUI());

  // Load graph on mount
  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const load = async () => {
      try {
        const res = isShared && shareId ? await graphApi.loadShared(shareId) : await graphApi.load();
        if (res.data?.nodes) {
          useGraphStore.getState().setGraph({
            nodes: res.data.nodes.map(n => ({ ...n, meta: n.meta || {} })),
            links: res.data.links || [],
            groups: res.data.groups || [],
            nextNodeId: res.data.nextNodeId || 1,
            nextLinkId: res.data.nextLinkId || 1,
            nextGroupId: res.data.nextGroupId || 1,
          });
        }
      } catch (_) {}
      finally { setLoading(false); }
    };
    if (!isShared) {
      graphApi.createShare().then(r => setOwnShareId(r.data.share_id)).catch(() => {});
    }
    load();
  }, [user, isShared, shareId, navigate]);

  // Listen for brainstorm results from Node component
  useEffect(() => {
    const handler = (e: Event) => {
      const { sourceId, ideas, startX, startY } = (e as CustomEvent).detail;
      ideas.forEach((idea: string, i: number) => {
        const n = addNode('answer', idea, startX, startY + i * 100);
        addLink(sourceId, n.id);
      });
      void saveGraph();
    };
    window.addEventListener('brainstorm:results', handler);
    return () => window.removeEventListener('brainstorm:results', handler);
  }, [addNode, addLink, saveGraph]);

  const buildContext = useCallback(() => {
    const { nodes, lastNodeId } = useGraphStore.getState();
    const sel = nodes.filter(n => n.selected);
    if (!sel.length) {
      if (lastNodeId !== null) {
        const l = nodes.find(n => n.id === lastNodeId);
        if (l && l.type !== "question") return l.text;
      }
      return "";
    }
    return sel.map(n => n.text).join('\n---\n');
  }, []);

  const [colorPicker, setColorPicker] = useState<{ x: number; y: number; editGroupId?: number; initialColor?: string; initialName?: string } | null>(null);

  const triggerGroupUI = useCallback(() => {
    const { nodes } = useGraphStore.getState();
    const sel = nodes.filter(n => n.selected);
    if (!sel.length) return;
    
    // Find the first selected node's DOM element for positioning
    const el = document.querySelector(`.node[data-id="${sel[0].id}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setColorPicker({ x: rect.left, y: rect.top - 100 });
    } else {
      setColorPicker({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
  }, []);

  useEffect(() => {
    const handleRecolor = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const g = useGraphStore.getState().groups.find(x => x.id === id);
      if (!g) return;
      const el = document.querySelector(`.group-hull[data-gid="${id}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setColorPicker({ x: rect.left + rect.width / 2 - 100, y: rect.top - 80, editGroupId: id, initialColor: g.color, initialName: g.name });
      } else {
        setColorPicker({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100, editGroupId: id, initialColor: g.color, initialName: g.name });
      }
    };
    window.addEventListener('canvas:triggerGroupRecolor', handleRecolor);
    return () => window.removeEventListener('canvas:triggerGroupRecolor', handleRecolor);
  }, []);

  const handleGroupConfirm = useCallback((color: string, name: string) => {
    const store = useGraphStore.getState();
    if (colorPicker?.editGroupId) {
      updateGroup(colorPicker.editGroupId, { color, name });
      saveGraph();
    } else {
      const sel = store.nodes.filter(n => n.selected);
      if (sel.length > 0) {
        createGroup(sel.map(n => n.id), color, name);
      }
    }
    setColorPicker(null);
  }, [colorPicker, updateGroup, createGroup, saveGraph]);

  const handleSend = useCallback(async (raw: string) => {
    const { nodes } = useGraphStore.getState();
    const store = useGraphStore.getState();

    // Slash commands
    if (raw === '/undo') { store.undo(); return; }
    if (raw === '/redo') { store.redo(); return; }
    if (raw.startsWith('/delete')) {
      const arg = raw.slice(7).trim().toLowerCase();
      store.pushUndo();
      if (arg === 'all') {
        useGraphStore.setState({ nodes: [], links: [], groups: [] });
      } else if (arg === 'last' || arg === '') {
        if (!nodes.length) return;
        const last = nodes.reduce((a, b) => a.id > b.id ? a : b);
        deleteNode(last.id);
      } else if (arg === 'prompts' || arg === 'questions') {
        nodes.filter(n => n.type === 'question').forEach(n => deleteNode(n.id));
      } else {
        const match = nodes.find(n => (n.text || '').toLowerCase().includes(arg));
        if (match) deleteNode(match.id);
      }
      await saveGraph();
      return;
    }
    if (raw.startsWith('/find ')) {
      const query = raw.slice(6).trim();
      const descs = nodes.map(n => ({ id: n.id, text: (n.text || '').slice(0, 200) }));
      try {
        const res = await aiApi.find(query, descs);
        if (res.data.nodeId) {
          const t = nodes.find(n => n.id === res.data.nodeId);
          if (t) {
            window.dispatchEvent(new CustomEvent('canvas:findNode', { detail: { x: t.x, y: t.y, id: t.id } }));
          }
        }
      } catch (_) {}
      return;
    }

    // Normal send
    dimAllNodes();
    const ctx = buildContext();
    const spawn = getSmartSpawnPos();

    let cls: { type: string; seconds?: number } = { type: 'ai_command' };
    try { const r = await aiApi.classify(raw); cls = r.data; } catch (_) {}

    if (cls.type === 'timer' && cls.seconds) {
      addNode('timer', `timer ${cls.seconds}s`, spawn.x, spawn.y, { seconds: cls.seconds });
      setSuggestions([]);
      await saveGraph();
      return;
    }

    const qn = addNode('question', raw, spawn.x, spawn.y);
    try {
      const r = await aiApi.chat(raw, ctx);
      const an = addNode('answer', r.data.reply || '', spawn.x + 340, spawn.y);
      addLink(qn.id, an.id);
      // Select answer
      useGraphStore.setState(s => ({
        nodes: s.nodes.map(n => ({ ...n, selected: n.id === an.id }))
      }));
      // Get suggestions
      aiApi.suggest(raw, r.data.reply || '').then(sr => setSuggestions(sr.data.suggestions?.slice(0, 3) || [])).catch(() => {});
    } catch (_) {}
    await saveGraph();
  }, [addNode, addLink, deleteNode, dimAllNodes, buildContext, getSmartSpawnPos, saveGraph]);

  const handleStudy = async () => {
    const ctx = buildContext();
    if (!ctx) { alert('Select some nodes first.'); return; }
    const spawn = getSmartSpawnPos();
    try {
      const r = await aiApi.chat('Create a short focused study drill or quiz. Keep it concise.', ctx);
      addNode('answer', r.data.reply || '', spawn.x, spawn.y);
      await saveGraph();
    } catch (_) {}
  };

  const handleNote = () => {
    const spawn = getSmartSpawnPos();
    addNode('note', '', spawn.x, spawn.y, { title: 'Untitled' });
  };

  const handleBrainstorm = () => {
    const { nodes, explicitlyDeselected, lastNodeId } = useGraphStore.getState();
    const sel = nodes.filter(n => n.selected);
    
    if (!sel.length) {
      if (!explicitlyDeselected && lastNodeId !== null) {
        const last = nodes.find(n => n.id === lastNodeId);
        if (last) {
          addNode('brainstorm', last.text || '', last.x + 380, last.y, { topic: (last.text || '').slice(0, 100) });
          return;
        }
      }
      const spawn = getSmartSpawnPos();
      addNode('brainstorm', '', spawn.x, spawn.y, { topic: '' });
    } else {
      const cx = Math.max(...sel.map(n => n.x)) + 380;
      const cy = sel.reduce((sum, n) => sum + n.y, 0) / sel.length;
      const topicText = sel.map(n => n.text).join("\n");
      const nn = addNode('brainstorm', topicText, cx, cy, { topic: topicText.slice(0, 100) });
      
      // We don't manually map addLink here because `addNode` already automatically Auto-Links to all currently `selected` nodes!
      // AddNode logic: "if (sel.length > 0) { sel.forEach(s => addLinkDirect(s.id, newNode.id)); }"
    }
  };

  if (loading) {
    return (
      <div style={{ background: '#000', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
        Loading canvas…
      </div>
    );
  }

  return (
    <div id="app">
      <TopBar
        onSettings={() => setShowSettings(true)}
        onShare={() => setShowShare(true)}
        onDash={() => setShowDashboard(true)}
        onStudy={handleStudy}
        onNote={handleNote}
        onBrainstorm={handleBrainstorm}
        onAuto={autoLayout}
        onGroup={triggerGroupUI}
        presenceBar={<PresenceBar users={presenceUsers} />}
      />

      <Canvas shareId={isShared ? shareId : undefined} />

      <SuggestionsBar
        suggestions={suggestions}
        onSelect={s => {
          // Fill prompt instead of sending (matching original behavior)
          const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
          if (promptEl) { promptEl.value = s; promptEl.focus(); }
          setSuggestions([]);
        }}
      />

      <InputBar
        onSend={text => { setSuggestions([]); handleSend(text); }}
      />

      <ZoomControls
        onZoomIn={() => window.dispatchEvent(new Event('canvas:zoomIn'))}
        onZoomOut={() => window.dispatchEvent(new Event('canvas:zoomOut'))}
        onRecenter={() => window.dispatchEvent(new Event('canvas:recenter'))}
      />

      {colorPicker && (
        <ColorPicker
          x={colorPicker.x}
          y={colorPicker.y}
          isEditing={!!colorPicker.editGroupId}
          initialColor={colorPicker.initialColor}
          initialName={colorPicker.initialName}
          onConfirm={handleGroupConfirm}
          onCancel={() => setColorPicker(null)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showShare && <ShareModal shareId={isShared ? (shareId || null) : ownShareId} onClose={() => setShowShare(false)} />}
      {showDashboard && <DashboardModal onClose={() => setShowDashboard(false)} />}
    </div>
  );
}
