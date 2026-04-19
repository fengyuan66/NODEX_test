import React, { useState, useEffect, useRef } from 'react';
import { graphApi } from '../../../api/client';

interface ShareModalProps {
  shareId: string | null;
  onClose: () => void;
}

interface Collab {
  email: string;
}

export default function ShareModal({ shareId, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [collaborators, setCollaborators] = useState<Collab[]>([]);
  const [status, setStatus] = useState<'Invite' | 'Adding...'>('Invite');
  const [copied, setCopied] = useState(false);

  const link = shareId ? `${window.location.origin}/shared/${shareId}` : '';
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shareId) {
      graphApi.collaborators(shareId).then(res => {
        if (res.data && res.data.collaborators) {
          setCollaborators(res.data.collaborators);
        }
      }).catch(() => {});
    }
  }, [shareId]);

  const handleInvite = async () => {
    if (!email.trim() || !shareId) return;
    setStatus('Adding...');
    try {
      const res = await graphApi.invite(shareId, email);
      if (res.data.ok) {
        setEmail('');
        const cRes = await graphApi.collaborators(shareId);
        if (cRes.data.collaborators) setCollaborators(cRes.data.collaborators);
      } else {
        alert(res.data.error || 'Could not add user.');
      }
    } catch (e) {
      alert('Error fetching collaborators');
    }
    setStatus('Invite');
  };

  const handleCopy = () => {
    if (inputRef.current) {
      inputRef.current.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!shareId) return null;

  return (
    <div className="modal-overlay visible" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">Share Canvas</div>
        
        <div className="settings-row">
          <div className="settings-label">Add people by email</div>
          <div className="share-input-wrap">
            <input 
              type="email" 
              className="modal-input" 
              placeholder="collab@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
            />
            <button className="modal-btn primary" onClick={handleInvite}>
              {status}
            </button>
          </div>
        </div>

        {collaborators.length > 0 && (
          <div className="settings-row" id="collab-wrap">
            <div className="settings-label">Collaborators</div>
            <div className="collab-list">
              {collaborators.map((c, i) => (
                <div key={i} className="collab-item">
                  <span>{c.email}</span>
                  <span style={{ color: 'var(--muted2)' }}>Can Edit</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: '1px', background: 'var(--border2)', margin: '8px 0' }}></div>
        
        <div className="settings-row">
          <div className="settings-label">Or share via link</div>
          <div className="share-input-wrap">
            <input 
              type="text" 
              className="modal-input" 
              readOnly 
              value={link}
              ref={inputRef}
            />
            <button className="modal-btn" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <button className="modal-close" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
