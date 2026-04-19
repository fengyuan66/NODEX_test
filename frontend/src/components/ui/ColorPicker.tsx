import React, { useEffect, useState } from 'react';

const GROUP_COLORS = ["#f87171","#fb923c","#fbbf24","#a3e635","#34d399","#22d3ee","#60a5fa","#a78bfa","#f472b6","#e2e8f0"];

interface ColorPickerProps {
  x: number;
  y: number;
  initialColor?: string;
  initialName?: string;
  isEditing: boolean;
  onConfirm: (color: string, name: string) => void;
  onCancel: () => void;
}

export default function ColorPicker({
  x, y, initialColor, initialName, isEditing, onConfirm, onCancel
}: ColorPickerProps) {
  const [color, setColor] = useState(initialColor || GROUP_COLORS[7]);
  const [name, setName] = useState(initialName || '');

  // Reset state if props change (e.g. opened for a different group)
  useEffect(() => {
    setColor(initialColor || GROUP_COLORS[7]);
    setName(initialName || '');
  }, [initialColor, initialName, isEditing]);

  return (
    <div
      id="color-picker-popup"
      className="visible"
      style={{ top: y, left: x, display: 'flex' }}
    >
      <div className="color-picker-title">Group Color</div>
      <div className="color-swatches">
        {GROUP_COLORS.map(c => (
          <div
            key={c}
            className={`color-swatch ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <input
        className="color-picker-input"
        placeholder="Group name (optional)"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onConfirm(color, name);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="color-picker-actions">
        <button className="color-picker-btn" onClick={() => onConfirm(color, name)}>
          {isEditing ? 'Update Group' : 'Create Group'}
        </button>
        <button className="color-picker-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
