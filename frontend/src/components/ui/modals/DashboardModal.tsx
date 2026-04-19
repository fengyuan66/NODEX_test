import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { graphApi } from '../../../api/client';

interface DashboardModalProps {
  onClose: () => void;
}

interface SharedGraph {
  share_id: string;
  added_at: string;
  updated_at: string;
  owner_email: string;
}

export default function DashboardModal({ onClose }: DashboardModalProps) {
  const [shared, setShared] = useState<SharedGraph[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    graphApi.dashboard()
      .then(res => {
        if (res.data && res.data.shared_with_me) {
          setShared(res.data.shared_with_me);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay visible" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width: '500px', maxWidth: '90vw' }}>
        <div className="modal-title">Canvas Hub</div>
        
        <div className="settings-row">
          <div className="settings-label">Your Canvas</div>
          <div className="dash-item" onClick={() => { navigate('/'); onClose(); }}>
            <span>Personal Graph</span>
            <span style={{ color: 'var(--accent)' }}>Go →</span>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--border2)', margin: '8px 0' }}></div>
        
        <div className="settings-row">
          <div className="settings-label">Shared with You</div>
          <div className="dash-list">
            {loading ? 'Loading...' : shared.length === 0 ? <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Nothing shared yet.</div> : (
              shared.map((item, i) => (
                <div key={i} className="dash-item" onClick={() => { navigate(`/shared/${item.share_id}`); onClose(); }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>From: {item.owner_email}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '10px', marginTop: '4px' }}>
                      Added: {new Date(item.added_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ color: 'var(--accent)' }}>Go →</span>
                </div>
              ))
            )}
          </div>
        </div>

        <button className="modal-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
