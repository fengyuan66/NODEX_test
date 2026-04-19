import React, { useState, useEffect } from 'react';
import { settingsApi } from '../../../api/client';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [zoomSpeed, setZoomSpeed] = useState('0.08');

  useEffect(() => {
    settingsApi.load().then(res => {
      if (res.data && res.data.zoomSpeed) {
        setZoomSpeed(String(res.data.zoomSpeed));
      }
    }).catch(() => {});
  }, []);

  const handleClose = () => {
    settingsApi.save({ zoomSpeed }).catch(() => {});
    onClose();
  };

  return (
    <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-box">
        <div className="modal-title">Settings</div>
        
        <div className="settings-row">
          <div className="settings-label">Zoom Speed</div>
          <select 
            className="settings-select" 
            value={zoomSpeed} 
            onChange={e => setZoomSpeed(e.target.value)}
          >
            <option value="0.03">Very Slow</option>
            <option value="0.05">Slow</option>
            <option value="0.08">Normal</option>
            <option value="0.12">Fast</option>
            <option value="0.2">Very Fast</option>
          </select>
        </div>

        <button className="modal-close" onClick={handleClose}>
          Close
        </button>
      </div>
    </div>
  );
}
