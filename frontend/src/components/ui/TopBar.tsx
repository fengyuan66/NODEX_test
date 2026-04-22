import { useAuth } from '../../hooks/useAuth';

interface TopBarProps {
  onStudy?: () => void;
  onAuto?: () => void;
  onGroup?: () => void;
  onNote?: () => void;
  onBrainstorm?: () => void;
  onChat?: () => void;
  onShare?: () => void;
  onDash?: () => void;
  onSettings?: () => void;
  presenceBar?: React.ReactNode;
}

export default function TopBar({
  onStudy, onAuto, onGroup, onNote, onBrainstorm, onChat, onShare, onDash, onSettings, presenceBar
}: TopBarProps) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div id="top-bar">
      <button className="top-btn" id="dash-btn" title="Dashboard" onClick={onDash}>🏠 Canvas Hub</button>
      <button className="top-btn" id="settings-btn" onClick={onSettings}>⚙</button>
      <div style={{ width: '1px', height: '16px', background: 'var(--border2)', margin: '0 4px' }}></div>
      <button className="top-btn" id="study-btn" onClick={onStudy}>Study</button>
      <button className="top-btn" id="auto-btn" onClick={onAuto}>Auto</button>
      <button className="top-btn" id="group-btn" onClick={onGroup}>Group</button>
      <button className="top-btn" id="note-btn" onClick={onNote}>Note</button>
      <button className="top-btn" id="brainstorm-btn" onClick={onBrainstorm}>Brainstorm</button>
      {onChat && (
        <button className="top-btn" id="chat-btn" type="button" onClick={onChat} title="New chat node on canvas">
          Chat
        </button>
      )}

      <div id="presence-bar">{presenceBar}</div>

      <button className="top-btn" id="share-btn" onClick={onShare}>Share</button>
      <div className="user-badge" id="user-badge">
        {user?.email} · <a href="#" onClick={e => { e.preventDefault(); handleLogout(); }}>Sign out</a>
      </div>
    </div>
  );
}
